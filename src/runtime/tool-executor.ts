import { hashActionRequest } from "@/domain/canonical-json";
import { evaluatePolicy } from "@/domain/policy-engine";
import { getCapability } from "@/domain/tool-registry";
import type { WorkerSpec } from "@/domain/worker-spec";
import type { ExecutionContext, ExecutionResult, IntegrationAdapter } from "@/integrations/types";

export type ToolExecutionRecord = {
  key: string; requestHash: string; capabilityId: string;
  status: "SUCCEEDED" | "FAILED" | "DENIED" | "DRY_RUN" | "WAITING_FOR_APPROVAL" | "OUTCOME_UNKNOWN";
  result: ExecutionResult | { ok: true; data: Record<string, unknown> };
};

export interface ToolExecutionRepository {
  get(key: string): Promise<ToolExecutionRecord | undefined>;
  save(record: ToolExecutionRecord): Promise<void>;
}

export class MemoryToolExecutionRepository implements ToolExecutionRepository {
  private readonly records = new Map<string, ToolExecutionRecord>();
  async get(key: string) { return this.records.get(key); }
  async save(record: ToolExecutionRecord) {
    const current = this.records.get(record.key);
    if (current && current.requestHash !== record.requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
    this.records.set(record.key, structuredClone(record));
  }
}

export async function executeGovernedTool(input: Readonly<{ spec: WorkerSpec; capabilityId: string; toolInput: unknown; context: ExecutionContext; adapter: IntegrationAdapter; executions: ToolExecutionRepository; executionsToday?: number }>): Promise<ToolExecutionRecord> {
  const key = `${input.context.runId}:${input.context.modelToolCallId}`;
  const requestHash = hashActionRequest({ capability: input.capabilityId, input: input.toolInput });
  const existing = await input.executions.get(key);
  if (existing) {
    if (existing.requestHash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
    return existing;
  }
  const policy = evaluatePolicy({ spec: input.spec, capabilityId: input.capabilityId, input: input.toolInput, executionsToday: input.executionsToday });
  if (policy.decision === "deny") {
    const record: ToolExecutionRecord = { key, requestHash, capabilityId: input.capabilityId, status: "DENIED", result: { ok: false, classification: "POLICY", message: policy.reason } };
    await input.executions.save(record); return record;
  }
  if (policy.decision === "require_approval" && input.context.mode === "live") {
    const record: ToolExecutionRecord = { key, requestHash, capabilityId: input.capabilityId, status: "WAITING_FOR_APPROVAL", result: { ok: false, classification: "POLICY", message: policy.reason } };
    await input.executions.save(record); return record;
  }
  const capability = getCapability(input.capabilityId)!;
  if (input.context.mode === "dry_run" && capability.effect !== "read") {
    const record: ToolExecutionRecord = { key, requestHash, capabilityId: input.capabilityId, status: "DRY_RUN", result: { ok: true, data: { dryRun: true, wouldExecute: { capability: input.capabilityId, input: input.toolInput } } } };
    await input.executions.save(record); return record;
  }
  const result = await input.adapter.executeCapability(input.capabilityId, input.toolInput, input.context);
  const status = result.ok ? "SUCCEEDED" : result.classification === "UNKNOWN_OUTCOME" ? "OUTCOME_UNKNOWN" : "FAILED";
  const record: ToolExecutionRecord = { key, requestHash, capabilityId: input.capabilityId, status, result };
  await input.executions.save(record); return record;
}
