import { describe, expect, it } from "vitest";

import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";
import { FakeIntegrationAdapter } from "@/integrations/fake-integration-adapter";
import { executeGovernedTool, MemoryToolExecutionRepository } from "@/runtime/tool-executor";

const spec = inboundSalesWorkerSpec();
const live = { organizationId: "org_1", workerId: "worker_1", workerVersionId: "version_1", runId: "run_1", modelToolCallId: "call_1", mode: "live" as const };

describe("governed side-effect execution", () => {
  it("replays a successful external write instead of executing twice", async () => {
    const adapter = new FakeIntegrationAdapter(); const executions = new MemoryToolExecutionRepository();
    const input = { spec, capabilityId: "hubspot.upsert_contact", toolInput: { email: "lead@example.com", lifecycleStage: "lead" }, context: live, adapter, executions };
    const first = await executeGovernedTool(input); const duplicate = await executeGovernedTool(input);
    expect(first.status).toBe("SUCCEEDED"); expect(duplicate).toEqual(first); expect(adapter.writes).toHaveLength(1);
  });

  it("rejects reusing a tool-call id for a different request", async () => {
    const adapter = new FakeIntegrationAdapter(); const executions = new MemoryToolExecutionRepository();
    await executeGovernedTool({ spec, capabilityId: "hubspot.upsert_contact", toolInput: { email: "one@example.com" }, context: live, adapter, executions });
    await expect(executeGovernedTool({ spec, capabilityId: "hubspot.upsert_contact", toolInput: { email: "two@example.com" }, context: live, adapter, executions })).rejects.toThrow("IDEMPOTENCY_KEY_REUSED");
  });

  it("suppresses writes before reaching any adapter in dry-run mode", async () => {
    const adapter = new FakeIntegrationAdapter(); const executions = new MemoryToolExecutionRepository();
    const record = await executeGovernedTool({ spec, capabilityId: "hubspot.upsert_contact", toolInput: { email: "lead@example.com" }, context: { ...live, mode: "dry_run" }, adapter, executions });
    expect(record.status).toBe("DRY_RUN"); expect(adapter.writes).toHaveLength(0);
  });

  it("pauses approval-required live writes before the adapter", async () => {
    const adapter = new FakeIntegrationAdapter(); const executions = new MemoryToolExecutionRepository();
    const record = await executeGovernedTool({ spec, capabilityId: "gmail.send_email", toolInput: { to: ["lead@example.com"], subject: "Hello", body: "Thanks for the enquiry" }, context: live, adapter, executions });
    expect(record.status).toBe("WAITING_FOR_APPROVAL"); expect(adapter.writes).toHaveLength(0);
  });

  it("persists unknown outcomes without retrying", async () => {
    const executions = new MemoryToolExecutionRepository(); let calls = 0;
    const adapter = { async getConnectionStatus() { return { provider: "hubspot" as const, connected: true }; }, async executeCapability() { calls++; return { ok: false as const, classification: "UNKNOWN_OUTCOME" as const, message: "Socket closed after dispatch" }; } };
    const args = { spec, capabilityId: "hubspot.upsert_contact", toolInput: { email: "lead@example.com" }, context: live, adapter, executions };
    expect((await executeGovernedTool(args)).status).toBe("OUTCOME_UNKNOWN");
    expect((await executeGovernedTool(args)).status).toBe("OUTCOME_UNKNOWN"); expect(calls).toBe(1);
  });
});
