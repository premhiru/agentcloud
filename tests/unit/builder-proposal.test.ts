import { describe, expect, it } from "vitest";

import { assessProposalReadiness, createWorkerProposal, diffWorkerSpecs } from "@/application/builder/proposal";
import type { CompilationResult } from "@/application/compiler/compiler";
import { hashWorkerSpec } from "@/domain/canonical-json";
import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";
import type { WorkerSpec } from "@/domain/worker-spec";

function compilation(overrides: Partial<CompilationResult> = {}): CompilationResult {
  return {
    spec: inboundSalesWorkerSpec(),
    requiredConnections: ["gmail", "hubspot", "slack"],
    missingConnections: [],
    unsupportedCapabilities: [],
    warnings: [],
    questions: [],
    summary: "A governed inbound sales worker.",
    ...overrides,
  };
}

describe("worker proposal", () => {
  it("fails closed when deployment prerequisites or human decisions are unresolved", () => {
    const readiness = assessProposalReadiness(compilation({
      missingConnections: ["slack", "gmail", "gmail"],
      unsupportedCapabilities: ["stripe.refund"],
      warnings: ["Review the daily limit."],
      questions: ["Which sales pipeline should be used?"],
    }));

    expect(readiness.ready).toBe(false);
    expect(readiness.checks.map(({ id, status }) => [id, status])).toEqual([
      ["authority", "passed"],
      ["connections", "blocked"],
      ["capabilities", "blocked"],
      ["questions", "blocked"],
      ["warnings", "warning"],
    ]);
    expect(readiness.checks.find(({ id }) => id === "connections")?.detail).toContain("gmail, slack");
  });

  it("keeps warnings visible without treating them as deployment blockers", () => {
    const readiness = assessProposalReadiness(compilation({ warnings: ["Review the daily limit."] }));

    expect(readiness.ready).toBe(true);
    expect(readiness.checks.find(({ id }) => id === "authority")).toMatchObject({
      status: "passed",
      detail: expect.stringContaining("Unknown operations are denied"),
    });
    expect(readiness.checks.find(({ id }) => id === "warnings")?.status).toBe("warning");
  });

  it("creates a canonical proposal hash and sorts copied compiler findings", () => {
    const result = compilation({
      missingConnections: ["slack", "gmail"],
      unsupportedCapabilities: ["z.tool", "a.tool"],
      warnings: ["Second", "First"],
    });

    const proposal = createWorkerProposal(result);

    expect(proposal.specHash).toBe(hashWorkerSpec(result.spec));
    expect(proposal.missingConnections).toEqual(["gmail", "slack"]);
    expect(proposal.unsupportedCapabilities).toEqual(["a.tool", "z.tool"]);
    expect(proposal.warnings).toEqual(["First", "Second"]);
    expect(proposal.diff).toEqual([{
      path: "$",
      kind: "added",
      after: "WorkerSpec 1.0 “Inbound Sales Guardian”",
      summary: "Create WorkerSpec 1.0 “Inbound Sales Guardian”",
    }]);
  });

  it("produces deterministic, human-readable path diffs", () => {
    const base = inboundSalesWorkerSpec();
    const proposed: WorkerSpec = {
      ...base,
      identity: { ...base.identity, name: "Inbound Sales Operator" },
      objective: "Qualify and route every inbound sales enquiry.",
      budget: { ...base.budget, perRunUsd: 2 },
    };

    const first = diffWorkerSpecs(base, proposed);
    const reorderedBase = Object.fromEntries(Object.entries(base).reverse()) as WorkerSpec;
    const reorderedProposed = Object.fromEntries(Object.entries(proposed).reverse()) as WorkerSpec;
    const second = diffWorkerSpecs(
      reorderedBase,
      reorderedProposed,
    );

    expect(first).toEqual(second);
    expect(first.map(({ path }) => path)).toEqual(["budget.perRunUsd", "identity.name", "objective"]);
    expect(first.map(({ summary }) => summary)).toEqual([
      "budget.perRunUsd: changed from 1 to 2",
      "identity.name: changed from \"Inbound Sales Guardian\" to \"Inbound Sales Operator\"",
      "objective: changed from \"Make sure good inbound sales enquiries are processed consistently and do not fall through the cracks.\" to \"Qualify and route every inbound sales enquiry.\"",
    ]);
    expect(diffWorkerSpecs(base, base)).toEqual([]);
  });
});
