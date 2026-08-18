import { beforeEach, describe, expect, it } from "vitest";

import { ApprovalEngine } from "@/approvals/approval-engine";
import { FakeApprovalWaitpoints, MemoryApprovalNotifier, MemoryApprovalRepository } from "@/approvals/memory-approval-adapters";
import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";
import { FakeIntegrationAdapter } from "@/integrations/fake-integration-adapter";
import { executeGovernedTool, MemoryToolExecutionRepository } from "@/runtime/tool-executor";

const toolInput = { to: ["lead@example.com"], subject: "Hello", body: "Thanks for your enquiry", api_key: "must-not-display" };
const safeToolInput = { to: toolInput.to, subject: toolInput.subject, body: toolInput.body };
const context = { organizationId: "org_1", workerId: "worker_1", workerVersionId: "version_1", runId: "run_1", modelToolCallId: "call_email", mode: "live" as const };

describe("Approval Engine", () => {
  let repository: MemoryApprovalRepository; let waitpoints: FakeApprovalWaitpoints; let notifier: MemoryApprovalNotifier; let executions: MemoryToolExecutionRepository; let adapter: FakeIntegrationAdapter;
  beforeEach(() => { repository = new MemoryApprovalRepository(); waitpoints = new FakeApprovalWaitpoints(); notifier = new MemoryApprovalNotifier(); executions = new MemoryToolExecutionRepository(); adapter = new FakeIntegrationAdapter(); });

  async function waitingExecution() {
    await executeGovernedTool({ spec: inboundSalesWorkerSpec(), capabilityId: "gmail.send_email", toolInput: safeToolInput, context, adapter, executions });
  }

  it("binds a redacted approval to the exact canonical request", async () => {
    const engine = new ApprovalEngine(repository, waitpoints, notifier);
    const approval = await engine.request({ ...context, capabilityId: "gmail.send_email", toolInput, reason: "External email requires approval" });
    expect(approval.redactedInputPreview).toMatchObject({ api_key: "[REDACTED]" });
    expect(approval.requestHash).toMatch(/^[a-f0-9]{64}$/); expect(notifier.notifications).toHaveLength(1);
  });

  it("approves and executes exactly once on the same waiting run", async () => {
    await waitingExecution(); const engine = new ApprovalEngine(repository, waitpoints, notifier);
    const approval = await engine.request({ ...context, capabilityId: "gmail.send_email", toolInput: safeToolInput, reason: "External email requires approval" });
    await engine.decide({ organizationId: "org_1", approvalId: approval.id, decidingUserId: "user_1", decision: "approve" });
    expect((await engine.executeApproved({ organizationId: "org_1", approvalId: approval.id, exactToolInput: safeToolInput, adapter, executions })).status).toBe("SUCCEEDED");
    expect((await engine.executeApproved({ organizationId: "org_1", approvalId: approval.id, exactToolInput: safeToolInput, adapter, executions })).status).toBe("SUCCEEDED");
    expect(adapter.writes).toHaveLength(1);
  });

  it("refuses a changed request after approval", async () => {
    await waitingExecution(); const engine = new ApprovalEngine(repository, waitpoints, notifier);
    const approval = await engine.request({ ...context, capabilityId: "gmail.send_email", toolInput: safeToolInput, reason: "Approval needed" });
    await engine.decide({ organizationId: "org_1", approvalId: approval.id, decidingUserId: "user_1", decision: "approve" });
    await expect(engine.executeApproved({ organizationId: "org_1", approvalId: approval.id, exactToolInput: { ...safeToolInput, to: ["attacker@example.com"] }, adapter, executions })).rejects.toThrow("HASH_MISMATCH");
    expect(adapter.writes).toHaveLength(0);
  });

  it("returns a structured denial on rejection", async () => {
    const engine = new ApprovalEngine(repository, waitpoints, notifier); const approval = await engine.request({ ...context, capabilityId: "gmail.send_email", toolInput: safeToolInput, reason: "Approval needed" });
    await engine.decide({ organizationId: "org_1", approvalId: approval.id, decidingUserId: "user_1", decision: "reject", comment: "Do not contact" });
    expect(await engine.executeApproved({ organizationId: "org_1", approvalId: approval.id, exactToolInput: safeToolInput, adapter, executions })).toMatchObject({ status: "REJECTED", result: { ok: false, classification: "POLICY" } });
  });

  it("expires pending requests and enforces tenant scope", async () => {
    let now = new Date("2026-08-18T00:00:00Z"); const engine = new ApprovalEngine(repository, waitpoints, notifier, () => now);
    const approval = await engine.request({ ...context, capabilityId: "gmail.send_email", toolInput: safeToolInput, reason: "Approval needed", ttlMs: 1_000 });
    await expect(engine.decide({ organizationId: "org_2", approvalId: approval.id, decidingUserId: "user_2", decision: "approve" })).rejects.toThrow("NOT_FOUND");
    now = new Date("2026-08-18T00:00:02Z");
    await expect(engine.decide({ organizationId: "org_1", approvalId: approval.id, decidingUserId: "user_1", decision: "approve" })).rejects.toThrow("EXPIRED");
  });
});
