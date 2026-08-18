import { describe, expect, it } from "vitest";

import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";
import { FakeIntegrationAdapter } from "@/integrations/fake-integration-adapter";
import { FakeInboundSalesModel } from "@/runtime/fake-worker-model";
import { MemoryToolExecutionRepository } from "@/runtime/tool-executor";
import { MemoryRunnerJournal, runWorker } from "@/runtime/worker-runner";

const payload = { organizationId: "org_1", workerId: "worker_1", workerVersionId: "version_1", runId: "run_1", mode: "dry_run" as const, trigger: { type: "manual" as const, payload: {} } };

describe("generic worker runner", () => {
  it("runs the actual plan but suppresses every dry-run write", async () => {
    const integrations = new FakeIntegrationAdapter(); const journal = new MemoryRunnerJournal();
    const result = await runWorker({ payload, spec: inboundSalesWorkerSpec(), model: new FakeInboundSalesModel(), integrations, executions: new MemoryToolExecutionRepository(), journal });
    expect(result.status).toBe("SUCCEEDED"); expect(integrations.writes).toHaveLength(0);
    expect(journal.steps.get("run_1")?.filter((step) => step.type === "dry_run")).toHaveLength(3);
  });

  it("pauses a live run at the approval-required email without posting Slack", async () => {
    const integrations = new FakeIntegrationAdapter(); const journal = new MemoryRunnerJournal();
    const result = await runWorker({ payload: { ...payload, runId: "run_live", mode: "live" }, spec: inboundSalesWorkerSpec(), model: new FakeInboundSalesModel(), integrations, executions: new MemoryToolExecutionRepository(), journal });
    expect(result.status).toBe("WAITING_FOR_APPROVAL");
    expect(integrations.writes.map((write) => write.capabilityId)).toEqual(["hubspot.upsert_contact"]);
  });

  it("stops before model execution when a budget is exhausted", async () => {
    const result = await runWorker({ payload: { ...payload, runId: "budget" }, spec: inboundSalesWorkerSpec(), model: new FakeInboundSalesModel(), integrations: new FakeIntegrationAdapter(), executions: new MemoryToolExecutionRepository(), journal: new MemoryRunnerJournal(), initialUsage: { monthlyCostUsd: 50, runCostUsd: 0, modelCalls: 0, toolCalls: 0 } });
    expect(result.status).toBe("BUDGET_EXCEEDED");
  });
});
