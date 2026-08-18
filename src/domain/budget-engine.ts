import type { WorkerSpec } from "./worker-spec";

export type BudgetUsage = Readonly<{
  monthlyCostUsd: number;
  runCostUsd: number;
  modelCalls: number;
  toolCalls: number;
}>;

export type BudgetDecision = { allowed: true } | { allowed: false; code: "BUDGET_EXCEEDED"; reason: string };

export const MODEL_CALL_ESTIMATE_USD = 0.003;
export const TOOL_CALL_ESTIMATE_USD = 0.0001;

export function checkBudget(spec: WorkerSpec, usage: BudgetUsage): BudgetDecision {
  if (usage.monthlyCostUsd >= spec.budget.monthlyUsd) return { allowed: false, code: "BUDGET_EXCEEDED", reason: "Monthly budget exhausted" };
  if (usage.runCostUsd >= spec.budget.perRunUsd) return { allowed: false, code: "BUDGET_EXCEEDED", reason: "Per-run budget exhausted" };
  if (usage.modelCalls >= spec.budget.maxModelCallsPerRun) return { allowed: false, code: "BUDGET_EXCEEDED", reason: "Model call limit reached" };
  if (usage.toolCalls >= spec.budget.maxToolCallsPerRun) return { allowed: false, code: "BUDGET_EXCEEDED", reason: "Tool call limit reached" };
  return { allowed: true };
}

export type ModelUsagePrice = Readonly<{ inputPerMillionUsd: number; outputPerMillionUsd: number }>;

export function estimateModelCost(inputTokens: number, outputTokens: number, price: ModelUsagePrice): number {
  if ([inputTokens, outputTokens, price.inputPerMillionUsd, price.outputPerMillionUsd].some((value) => value < 0 || !Number.isFinite(value))) {
    throw new TypeError("Usage and pricing values must be finite and non-negative");
  }
  return (inputTokens * price.inputPerMillionUsd + outputTokens * price.outputPerMillionUsd) / 1_000_000;
}
