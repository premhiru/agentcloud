import { randomUUID } from "node:crypto";

import { hashActionRequest } from "@/domain/canonical-json";
import type { IntegrationAdapter } from "@/integrations/types";
import { redactSecrets } from "@/lib/redaction";
import type { ToolExecutionRepository } from "@/runtime/tool-executor";
import type { ApprovalNotifier, ApprovalRecord, ApprovalRepository, ApprovalWaitpoints } from "./types";

export class ApprovalEngine {
  constructor(private readonly repository: ApprovalRepository, private readonly waitpoints: ApprovalWaitpoints, private readonly notifier: ApprovalNotifier, private readonly clock: () => Date = () => new Date()) {}

  async request(input: Readonly<{ organizationId: string; workerId: string; workerVersionId: string; runId: string; modelToolCallId: string; capabilityId: string; toolInput: unknown; reason: string; ttlMs?: number }>): Promise<ApprovalRecord> {
    const requestedAt = this.clock(); const expiresAt = new Date(requestedAt.getTime() + (input.ttlMs ?? 86_400_000));
    const requestHash = hashActionRequest({ capability: input.capabilityId, input: input.toolInput });
    const waitpoint = await this.waitpoints.create({ idempotencyKey: `approval:${input.runId}:${input.modelToolCallId}`, expiresAt, tags: [`org:${input.organizationId}`, `run:${input.runId}`] });
    const record: ApprovalRecord = { id: randomUUID(), ...input, redactedInputPreview: redactSecrets(input.toolInput) as Record<string, unknown>, normalizedInput: structuredClone(input.toolInput), requestHash, status: "PENDING", waitpointId: waitpoint.id, requestedAt, expiresAt };
    await this.repository.create(record); await this.notifier.requested(record); return record;
  }

  async decide(input: Readonly<{ organizationId: string; approvalId: string; decidingUserId: string; decision: "approve" | "reject"; comment?: string }>): Promise<ApprovalRecord> {
    const record = await this.repository.get({ organizationId: input.organizationId, approvalId: input.approvalId });
    if (!record) throw new Error("APPROVAL_NOT_FOUND");
    if (record.status !== "PENDING") throw new Error("APPROVAL_ALREADY_DECIDED");
    const now = this.clock();
    if (record.expiresAt <= now) { record.status = "EXPIRED"; await this.repository.update(record); throw new Error("APPROVAL_EXPIRED"); }
    record.status = input.decision === "approve" ? "APPROVED" : "REJECTED"; record.decidedAt = now; record.decidedBy = input.decidingUserId; record.comment = input.comment;
    await this.repository.update(record);
    await this.waitpoints.complete(record.waitpointId, { decision: input.decision === "approve" ? "approved" : "rejected", requestHash: record.requestHash, comment: input.comment });
    return record;
  }

  async executeApproved(input: Readonly<{ organizationId: string; approvalId: string; exactToolInput: unknown; adapter: IntegrationAdapter; executions: ToolExecutionRepository }>) {
    const approval = await this.repository.get({ organizationId: input.organizationId, approvalId: input.approvalId });
    if (!approval) throw new Error("APPROVAL_NOT_FOUND");
    if (approval.status === "REJECTED") return { status: "REJECTED" as const, result: { ok: false as const, classification: "POLICY" as const, message: "Human rejected this action" } };
    if (approval.status !== "APPROVED") throw new Error("APPROVAL_NOT_APPROVED");
    const hash = hashActionRequest({ capability: approval.capabilityId, input: input.exactToolInput });
    if (hash !== approval.requestHash) throw new Error("APPROVAL_REQUEST_HASH_MISMATCH");
    const key = `${approval.runId}:${approval.modelToolCallId}`; const existing = await input.executions.get(key);
    if (!existing || existing.requestHash !== hash) throw new Error("APPROVAL_EXECUTION_NOT_WAITING");
    if (["SUCCEEDED", "OUTCOME_UNKNOWN", "FAILED"].includes(existing.status)) return { status: existing.status, result: existing.result };
    if (existing.status !== "WAITING_FOR_APPROVAL") throw new Error("APPROVAL_EXECUTION_NOT_WAITING");
    const result = await input.adapter.executeCapability(approval.capabilityId, input.exactToolInput, { organizationId: approval.organizationId, workerId: approval.workerId, workerVersionId: approval.workerVersionId, runId: approval.runId, modelToolCallId: approval.modelToolCallId, mode: "live" });
    const status = result.ok ? "SUCCEEDED" : result.classification === "UNKNOWN_OUTCOME" ? "OUTCOME_UNKNOWN" : "FAILED";
    await input.executions.save({ ...existing, status, result });
    return { status, result };
  }
}
