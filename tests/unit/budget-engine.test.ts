import { describe, expect, it } from "vitest";

import { checkBudget, estimateModelCost } from "@/domain/budget-engine";
import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";

describe("Budget Engine", () => {
  const spec = inboundSalesWorkerSpec();

  it("allows usage inside every boundary", () => {
    expect(checkBudget(spec, { monthlyCostUsd: 1, runCostUsd: 0.1, modelCalls: 1, toolCalls: 2 })).toEqual({ allowed: true });
  });

  it.each([
    [{ monthlyCostUsd: 50, runCostUsd: 0, modelCalls: 0, toolCalls: 0 }, "Monthly"],
    [{ monthlyCostUsd: 0, runCostUsd: 1, modelCalls: 0, toolCalls: 0 }, "Per-run"],
    [{ monthlyCostUsd: 0, runCostUsd: 0, modelCalls: 12, toolCalls: 0 }, "Model"],
    [{ monthlyCostUsd: 0, runCostUsd: 0, modelCalls: 0, toolCalls: 30 }, "Tool"],
  ])("denies an exhausted limit", (usage, reason) => {
    expect(checkBudget(spec, usage)).toMatchObject({ allowed: false, reason: expect.stringContaining(reason) });
  });

  it("estimates token cost", () => {
    expect(estimateModelCost(1_000_000, 500_000, { inputPerMillionUsd: 1, outputPerMillionUsd: 4 })).toBe(3);
  });
});
