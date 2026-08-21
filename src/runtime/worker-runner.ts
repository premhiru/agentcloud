import { checkBudget, MODEL_CALL_ESTIMATE_USD, TOOL_CALL_ESTIMATE_USD, type BudgetUsage } from "@/domain/budget-engine";
import { getCapability } from "@/domain/tool-registry";
import type { WorkerSpec } from "@/domain/worker-spec";
import { deepFreeze } from "@/domain/worker-version";
import type { IntegrationAdapter } from "@/integrations/types";
import { executeGovernedTool, type ToolExecutionRepository } from "./tool-executor";
import type { RunWorkerPayload } from "./types";

export type PlannedToolCall = Readonly<{ id: string; capabilityId: string; input: unknown; summary: string }>;
export interface WorkerModel { plan(input: Readonly<{ spec: WorkerSpec; trigger: RunWorkerPayload["trigger"]; mode: RunWorkerPayload["mode"] }>): Promise<Readonly<{ toolCalls: readonly PlannedToolCall[]; summary: string }>>; }
export type RunnerStep = Readonly<{ sequence: number; type: "trigger" | "tool" | "dry_run" | "approval" | "complete" | "error"; status: string; summary: string }>;
export interface RunnerJournal { append(runId: string, step: RunnerStep): Promise<void>; setStatus(runId: string, status: string): Promise<void>; }
export type RunnerCheckpoint = Readonly<{ pendingApproval: PlannedToolCall; remainingToolCalls: readonly PlannedToolCall[]; finalSummary: string; nextSequence: number; usage: BudgetUsage }>;

export class MemoryRunnerJournal implements RunnerJournal {
  readonly steps = new Map<string, RunnerStep[]>(); readonly statuses = new Map<string, string>();
  async append(runId: string, step: RunnerStep) { const list = this.steps.get(runId) ?? []; list.push(structuredClone(step)); this.steps.set(runId, list); }
  async setStatus(runId: string, status: string) { this.statuses.set(runId, status); }
}

export async function runWorker(input: Readonly<{ payload: RunWorkerPayload; spec: WorkerSpec; model: WorkerModel; integrations: IntegrationAdapter; executions: ToolExecutionRepository; journal: RunnerJournal; initialUsage?: BudgetUsage }>): Promise<{ status: string; summary?: string; checkpoint?: RunnerCheckpoint }> {
  const { payload, journal } = input; const spec = deepFreeze(structuredClone(input.spec));
  let sequence = 1;
  let usage: BudgetUsage = input.initialUsage ?? { monthlyCostUsd: 0, runCostUsd: 0, modelCalls: 0, toolCalls: 0 };
  await journal.setStatus(payload.runId, "RUNNING");
  await journal.append(payload.runId, { sequence: sequence++, type: "trigger", status: "SUCCEEDED", summary: `${payload.trigger.type} trigger received` });
  const beforeModel = checkBudget(spec, usage);
  if (!beforeModel.allowed) { await journal.setStatus(payload.runId, "BUDGET_EXCEEDED"); return { status: "BUDGET_EXCEEDED" }; }
  const plan = await input.model.plan({ spec, trigger: payload.trigger, mode: payload.mode });
  usage = { ...usage, modelCalls: usage.modelCalls + 1, monthlyCostUsd: usage.monthlyCostUsd + MODEL_CALL_ESTIMATE_USD, runCostUsd: usage.runCostUsd + MODEL_CALL_ESTIMATE_USD };

  for (const [callIndex, call] of plan.toolCalls.entries()) {
    const budget = checkBudget(spec, usage);
    if (!budget.allowed) { await journal.append(payload.runId, { sequence, type: "error", status: "BUDGET_EXCEEDED", summary: budget.reason }); await journal.setStatus(payload.runId, "BUDGET_EXCEEDED"); return { status: "BUDGET_EXCEEDED" }; }
    const capability = getCapability(call.capabilityId);
    if (capability) {
      const connection = await input.integrations.getConnectionStatus({ organizationId: payload.organizationId, provider: capability.integration, capabilityId: call.capabilityId });
      if (!connection.connected) { await journal.append(payload.runId, { sequence, type: "error", status: "FAILED", summary: `${capability.integration} connection is required` }); await journal.setStatus(payload.runId, "FAILED"); return { status: "FAILED" }; }
    }
    const execution = await executeGovernedTool({ spec, capabilityId: call.capabilityId, toolInput: call.input, context: { organizationId: payload.organizationId, workerId: payload.workerId, workerVersionId: payload.workerVersionId, runId: payload.runId, modelToolCallId: call.id, mode: payload.mode }, adapter: input.integrations, executions: input.executions });
    usage = { ...usage, toolCalls: usage.toolCalls + 1, monthlyCostUsd: usage.monthlyCostUsd + TOOL_CALL_ESTIMATE_USD, runCostUsd: usage.runCostUsd + TOOL_CALL_ESTIMATE_USD };
    if (execution.status === "WAITING_FOR_APPROVAL") { await journal.append(payload.runId, { sequence, type: "approval", status: execution.status, summary: call.summary }); await journal.setStatus(payload.runId, "WAITING_FOR_APPROVAL"); return { status: "WAITING_FOR_APPROVAL", checkpoint: { pendingApproval: call, remainingToolCalls: plan.toolCalls.slice(callIndex + 1), finalSummary: plan.summary, nextSequence: sequence + 1, usage } }; }
    if (execution.status === "OUTCOME_UNKNOWN") { await journal.append(payload.runId, { sequence, type: "error", status: execution.status, summary: `${call.summary}: outcome requires review` }); await journal.setStatus(payload.runId, "OUTCOME_UNKNOWN"); return { status: "OUTCOME_UNKNOWN" }; }
    if (execution.status === "FAILED" || execution.status === "DENIED") { await journal.append(payload.runId, { sequence, type: "error", status: execution.status, summary: call.summary }); await journal.setStatus(payload.runId, "FAILED"); return { status: "FAILED" }; }
    await journal.append(payload.runId, { sequence: sequence++, type: execution.status === "DRY_RUN" ? "dry_run" : "tool", status: "SUCCEEDED", summary: execution.status === "DRY_RUN" ? `Would ${call.summary.toLowerCase()}` : call.summary });
  }
  await journal.append(payload.runId, { sequence, type: "complete", status: "SUCCEEDED", summary: plan.summary });
  await journal.setStatus(payload.runId, "SUCCEEDED");
  return { status: "SUCCEEDED", summary: plan.summary };
}

export async function resumeWorkerFromCheckpoint(input: Readonly<{ payload: RunWorkerPayload; spec: WorkerSpec; checkpoint: RunnerCheckpoint; integrations: IntegrationAdapter; executions: ToolExecutionRepository; journal: RunnerJournal }>): Promise<{ status: string; summary?: string }> {
  const spec = deepFreeze(structuredClone(input.spec)); let sequence = input.checkpoint.nextSequence; let usage = input.checkpoint.usage;
  await input.journal.setStatus(input.payload.runId, "RUNNING");
  for (const call of input.checkpoint.remainingToolCalls) {
    const budget = checkBudget(spec, usage);
    if (!budget.allowed) { await input.journal.setStatus(input.payload.runId, "BUDGET_EXCEEDED"); return { status: "BUDGET_EXCEEDED" }; }
    const execution = await executeGovernedTool({ spec, capabilityId: call.capabilityId, toolInput: call.input, context: { organizationId: input.payload.organizationId, workerId: input.payload.workerId, workerVersionId: input.payload.workerVersionId, runId: input.payload.runId, modelToolCallId: call.id, mode: "live" }, adapter: input.integrations, executions: input.executions });
    usage = { ...usage, toolCalls: usage.toolCalls + 1, monthlyCostUsd: usage.monthlyCostUsd + TOOL_CALL_ESTIMATE_USD, runCostUsd: usage.runCostUsd + TOOL_CALL_ESTIMATE_USD };
    if (execution.status !== "SUCCEEDED") { await input.journal.append(input.payload.runId, { sequence, type: "error", status: execution.status, summary: call.summary }); await input.journal.setStatus(input.payload.runId, execution.status === "OUTCOME_UNKNOWN" ? "OUTCOME_UNKNOWN" : "FAILED"); return { status: execution.status === "OUTCOME_UNKNOWN" ? "OUTCOME_UNKNOWN" : "FAILED" }; }
    await input.journal.append(input.payload.runId, { sequence: sequence++, type: "tool", status: "SUCCEEDED", summary: call.summary });
  }
  await input.journal.append(input.payload.runId, { sequence, type: "complete", status: "SUCCEEDED", summary: input.checkpoint.finalSummary });
  await input.journal.setStatus(input.payload.runId, "SUCCEEDED"); return { status: "SUCCEEDED", summary: input.checkpoint.finalSummary };
}
