import { describe, expect, it } from "vitest";

import { ApprovalEngine } from "@/approvals/approval-engine";
import { FakeApprovalWaitpoints, MemoryApprovalNotifier, MemoryApprovalRepository } from "@/approvals/memory-approval-adapters";
import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";
import { FakeIntegrationAdapter } from "@/integrations/fake-integration-adapter";
import { FakeInboundSalesModel } from "@/runtime/fake-worker-model";
import { MemoryToolExecutionRepository } from "@/runtime/tool-executor";
import { MemoryRunnerJournal, resumeWorkerFromCheckpoint, runWorker } from "@/runtime/worker-runner";

describe("approval pause and exact-run resume", () => {
  it("continues from the checkpoint without re-running earlier actions", async () => {
    const payload = { organizationId: "org_1", workerId: "worker_1", workerVersionId: "version_1", runId: "run_resume", mode: "live" as const, trigger: { type: "manual" as const, payload: {} } };
    const spec = inboundSalesWorkerSpec(); const adapter = new FakeIntegrationAdapter(); const executions = new MemoryToolExecutionRepository(); const journal = new MemoryRunnerJournal();
    const paused = await runWorker({ payload, spec, model: new FakeInboundSalesModel(), integrations: adapter, executions, journal });
    expect(paused.status).toBe("WAITING_FOR_APPROVAL"); expect(paused.checkpoint?.remainingToolCalls.map((call) => call.capabilityId)).toEqual(["slack.post_message"]);
    const engine = new ApprovalEngine(new MemoryApprovalRepository(), new FakeApprovalWaitpoints(), new MemoryApprovalNotifier());
    const emailInput = { to: ["maya@northstar.example"], subject: "Re: Enterprise pricing enquiry", body: "Thanks for your enquiry. We would be glad to speak this week." };
    const approval = await engine.request({ organizationId: payload.organizationId, workerId: payload.workerId, workerVersionId: payload.workerVersionId, runId: payload.runId, modelToolCallId: "call_send_email", capabilityId: "gmail.send_email", toolInput: emailInput, reason: "External email requires approval" });
    await engine.decide({ organizationId: "org_1", approvalId: approval.id, decidingUserId: "user_1", decision: "approve" });
    await engine.executeApproved({ organizationId: "org_1", approvalId: approval.id, exactToolInput: emailInput, adapter, executions });
    const resumed = await resumeWorkerFromCheckpoint({ payload, spec, checkpoint: paused.checkpoint!, integrations: adapter, executions, journal });
    expect(resumed.status).toBe("SUCCEEDED");
    expect(adapter.writes.map((write) => write.capabilityId)).toEqual(["hubspot.upsert_contact", "gmail.send_email", "slack.post_message"]);
    expect(adapter.writes.filter((write) => write.capabilityId === "hubspot.upsert_contact")).toHaveLength(1);
  });
});
