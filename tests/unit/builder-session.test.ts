import { describe, expect, it } from "vitest";

import { MemoryBuilderSessionRepository, redactBuilderMessage, validateBuilderProposal } from "@/application/builder/session";
import { createWorkerProposal } from "@/application/builder/proposal";
import { hashWorkerSpec } from "@/domain/canonical-json";
import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";

function proposal(missingConnections: Array<"gmail" | "hubspot" | "slack"> = []) {
  return createWorkerProposal({
    spec: inboundSalesWorkerSpec(), requiredConnections: ["gmail", "hubspot", "slack"], missingConnections,
    unsupportedCapabilities: [], warnings: [], questions: [], summary: "A governed inbound sales worker.",
  });
}

describe("builder sessions", () => {
  it("stores append-only proposal revisions and uses optimistic concurrency", async () => {
    const repository = new MemoryBuilderSessionRepository();
    const session = await repository.create({ organizationId: "org_a", createdBy: "user_a" });
    const first = await repository.appendProposal({ organizationId: "org_a", sessionId: session.id, expectedRevision: 0, userMessage: "Build an inbound sales worker", proposal: proposal(["gmail"]) });
    expect(first).toMatchObject({ revision: 1, status: "OPEN" });
    const second = await repository.appendProposal({ organizationId: "org_a", sessionId: session.id, expectedRevision: 1, userMessage: "Use the connected Gmail account", proposal: proposal() });
    expect(second).toMatchObject({ revision: 2, status: "READY" });
    expect(second.proposals.map((item) => item.revision)).toEqual([1, 2]);
    expect(second.messages.map((item) => item.sequence)).toEqual([1, 2]);
    await expect(repository.appendProposal({ organizationId: "org_a", sessionId: session.id, expectedRevision: 1, userMessage: "Stale edit", proposal: proposal() })).rejects.toThrow("BUILDER_REVISION_CONFLICT");
  });

  it("fails closed across tenants and after abandonment", async () => {
    const repository = new MemoryBuilderSessionRepository();
    const session = await repository.create({ organizationId: "org_a", createdBy: "user_a" });
    expect(await repository.get("org_b", session.id)).toBeUndefined();
    await expect(repository.appendProposal({ organizationId: "org_b", sessionId: session.id, expectedRevision: 0, userMessage: "Cross tenant", proposal: proposal() })).rejects.toThrow("BUILDER_SESSION_NOT_FOUND");
    await repository.abandon("org_a", session.id, 0);
    await expect(repository.appendProposal({ organizationId: "org_a", sessionId: session.id, expectedRevision: 0, userMessage: "Late edit", proposal: proposal() })).rejects.toThrow("BUILDER_SESSION_CLOSED");
  });

  it("redacts credential-shaped content before it reaches persistence", async () => {
    expect(redactBuilderMessage("Use api_key=sk-1234567890abcdefgh and Authorization: Bearer abcdefghijklmnop")).toBe("Use api_key=[REDACTED] and Authorization=[REDACTED]");
    const repository = new MemoryBuilderSessionRepository();
    const session = await repository.create({ organizationId: "org_a", createdBy: "user_a" });
    const updated = await repository.appendProposal({ organizationId: "org_a", sessionId: session.id, expectedRevision: 0, userMessage: "password=hunter2 secret:abcdef123456", proposal: proposal() });
    expect(updated.messages[0]?.content).toBe("password=[REDACTED] secret=[REDACTED]");
  });

  it("revalidates hashes, registered capabilities, and high-risk authority before persistence", () => {
    const valid = proposal();
    expect(() => validateBuilderProposal({ ...valid, specHash: "forged" })).toThrow("BUILDER_PROPOSAL_HASH_MISMATCH");
    const unsafeSpec = {
      ...valid.spec,
      authority: { ...valid.spec.authority, rules: valid.spec.authority.rules.map((rule) => rule.capability === "gmail.send_email" ? { ...rule, effect: "allow" as const } : rule) },
    };
    expect(() => validateBuilderProposal({ ...valid, spec: unsafeSpec, specHash: hashWorkerSpec(unsafeSpec) })).toThrow("BUILDER_PROPOSAL_UNSAFE_AUTHORITY");
  });
});
