import "server-only";

import { and, eq } from "drizzle-orm";

import type { ApprovalNotifier, ApprovalRecord, ApprovalRepository } from "@/approvals/types";
import { getDatabase } from "@/db/client";
import { approvals, auditEvents, connections, runSteps, runs, toolExecutions } from "@/db/schema";
import type { IntegrationProvider } from "@/domain/tool-registry";
import type { ConnectionReference, ConnectionReferenceRepository } from "@/integrations/composio-adapter";
import type { ToolExecutionRecord, ToolExecutionRepository } from "@/runtime/tool-executor";
import type { RunnerJournal, RunnerStep } from "@/runtime/worker-runner";

export class PostgresConnectionReferenceRepository implements ConnectionReferenceRepository {
  constructor(private readonly organizationId: string) {}
  async get(input: Readonly<{ organizationId: string; provider: IntegrationProvider }>): Promise<ConnectionReference | undefined> {
    if (input.organizationId !== this.organizationId) return undefined;
    const [row] = await getDatabase().select().from(connections).where(and(eq(connections.organizationId, this.organizationId), eq(connections.provider, input.provider))).limit(1);
    return row ? { organizationId: this.organizationId, provider: row.provider, connectedAccountId: row.externalConnectionId, status: row.status, displayName: row.displayName } : undefined;
  }
}

export class PostgresToolExecutionRepository implements ToolExecutionRepository {
  constructor(private readonly organizationId: string, private readonly runId: string) {}
  private callId(key: string): string { const prefix = `${this.runId}:`; if (!key.startsWith(prefix)) throw new Error("TOOL_EXECUTION_SCOPE_MISMATCH"); return key.slice(prefix.length); }
  async get(key: string): Promise<ToolExecutionRecord | undefined> {
    const callId = this.callId(key); const [row] = await getDatabase().select().from(toolExecutions).where(and(eq(toolExecutions.organizationId, this.organizationId), eq(toolExecutions.runId, this.runId), eq(toolExecutions.modelToolCallId, callId))).limit(1);
    return row ? { key, requestHash: row.requestHash, capabilityId: row.capabilityId, status: row.status === "PENDING" ? "FAILED" : row.status, result: (row.outputJson ?? { ok: false, classification: "TRANSIENT", message: "Execution has no stored output" }) as ToolExecutionRecord["result"] } : undefined;
  }
  async save(record: ToolExecutionRecord): Promise<void> {
    const callId = this.callId(record.key); const db = getDatabase(); const [existing] = await db.select().from(toolExecutions).where(and(eq(toolExecutions.organizationId, this.organizationId), eq(toolExecutions.runId, this.runId), eq(toolExecutions.modelToolCallId, callId))).limit(1);
    if (existing && existing.requestHash !== record.requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
    const input = record.result && "data" in record.result && record.result.data && typeof record.result.data === "object" && "wouldExecute" in record.result.data ? (record.result.data.wouldExecute as { input?: unknown }).input : {};
    if (existing) await db.update(toolExecutions).set({ status: record.status, outputJson: record.result as Record<string, unknown>, completedAt: ["SUCCEEDED", "FAILED", "DRY_RUN", "DENIED", "OUTCOME_UNKNOWN"].includes(record.status) ? new Date() : null }).where(eq(toolExecutions.id, existing.id));
    else await db.insert(toolExecutions).values({ organizationId: this.organizationId, runId: this.runId, modelToolCallId: callId, capabilityId: record.capabilityId, requestHash: record.requestHash, status: record.status, inputJson: (input && typeof input === "object" ? input : { value: input }) as Record<string, unknown>, outputJson: record.result as Record<string, unknown> });
  }
}

export class PostgresRunnerJournal implements RunnerJournal {
  constructor(private readonly organizationId: string) {}
  async append(runId: string, step: RunnerStep): Promise<void> {
    await getDatabase().insert(runSteps).values({ organizationId: this.organizationId, runId, sequence: step.sequence, stepType: step.type, status: step.status, summary: step.summary }).onConflictDoNothing();
  }
  async setStatus(runId: string, status: string): Promise<void> {
    const completed = ["SUCCEEDED", "FAILED", "CANCELLED", "BUDGET_EXCEEDED", "OUTCOME_UNKNOWN"].includes(status);
    await getDatabase().update(runs).set({ status: status as typeof runs.$inferInsert.status, startedAt: status === "RUNNING" ? new Date() : undefined, completedAt: completed ? new Date() : undefined, updatedAt: new Date() }).where(and(eq(runs.organizationId, this.organizationId), eq(runs.id, runId)));
  }
}

export class PostgresApprovalRepository implements ApprovalRepository {
  constructor(private readonly organizationId: string) {}
  async create(record: ApprovalRecord): Promise<void> {
    if (record.organizationId !== this.organizationId) throw new Error("TENANT_ACCESS_DENIED");
    const [execution] = await getDatabase().select({ id: toolExecutions.id }).from(toolExecutions).where(and(eq(toolExecutions.organizationId, this.organizationId), eq(toolExecutions.runId, record.runId), eq(toolExecutions.modelToolCallId, record.modelToolCallId))).limit(1);
    await getDatabase().insert(approvals).values({ id: record.id, organizationId: this.organizationId, workerId: record.workerId, workerVersionId: record.workerVersionId, runId: record.runId, toolExecutionId: execution?.id, capabilityId: record.capabilityId, redactedInputPreview: record.redactedInputPreview, requestHash: record.requestHash, reason: record.reason, status: record.status, waitpointId: record.waitpointId, requestedAt: record.requestedAt, expiresAt: record.expiresAt, comment: record.comment });
  }
  async get(input: Readonly<{ organizationId: string; approvalId: string }>): Promise<ApprovalRecord | undefined> {
    if (input.organizationId !== this.organizationId) return undefined; const db = getDatabase(); const [row] = await db.select().from(approvals).where(and(eq(approvals.organizationId, this.organizationId), eq(approvals.id, input.approvalId))).limit(1); if (!row) return undefined;
    const [execution] = row.toolExecutionId ? await db.select().from(toolExecutions).where(and(eq(toolExecutions.organizationId, this.organizationId), eq(toolExecutions.id, row.toolExecutionId))).limit(1) : [];
    return { id: row.id, organizationId: this.organizationId, workerId: row.workerId, workerVersionId: row.workerVersionId, runId: row.runId, modelToolCallId: execution?.modelToolCallId ?? "", capabilityId: row.capabilityId, redactedInputPreview: row.redactedInputPreview, normalizedInput: execution?.inputJson ?? row.redactedInputPreview, requestHash: row.requestHash, reason: row.reason, status: row.status, waitpointId: row.waitpointId ?? "", requestedAt: row.requestedAt, expiresAt: row.expiresAt, decidedAt: row.decidedAt ?? undefined, decidedBy: row.decidedBy ?? undefined, comment: row.comment ?? undefined };
  }
  async update(record: ApprovalRecord): Promise<void> {
    if (record.organizationId !== this.organizationId) throw new Error("TENANT_ACCESS_DENIED"); await getDatabase().update(approvals).set({ status: record.status, decidedAt: record.decidedAt, decidedBy: record.decidedBy, comment: record.comment }).where(and(eq(approvals.organizationId, this.organizationId), eq(approvals.id, record.id)));
  }
}

export class PostgresApprovalNotifier implements ApprovalNotifier {
  constructor(private readonly organizationId: string) {}
  async requested(record: ApprovalRecord): Promise<void> {
    await getDatabase().insert(auditEvents).values({ organizationId: this.organizationId, actorType: "worker", actorId: record.workerId, action: "approval.requested", targetType: "approval", targetId: record.id, metadataJson: { runId: record.runId, capabilityId: record.capabilityId } });
  }
}
