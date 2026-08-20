import { describe, expect, it } from "vitest";

import { BuilderService } from "@/application/builder/service";
import { MemoryBuilderSessionRepository } from "@/application/builder/session";
import {
  FakeCompilerModel,
  type CompilerModel,
} from "@/application/compiler/compiler";
import type { IntegrationProvider } from "@/domain/tool-registry";

type ModelInput = Parameters<CompilerModel["propose"]>[0];

class RecordingFakeCompilerModel extends FakeCompilerModel {
  readonly calls: ModelInput[] = [];

  override async propose(input: ModelInput) {
    this.calls.push(structuredClone(input));
    return super.propose(input);
  }
}

function fixture(initialConnections: readonly IntegrationProvider[] = []) {
  const repository = new MemoryBuilderSessionRepository();
  const model = new RecordingFakeCompilerModel();
  let connections = [...initialConnections];
  const organizations: string[] = [];
  const service = new BuilderService(repository, model, async (organizationId) => {
    organizations.push(organizationId);
    return connections;
  });
  return {
    model,
    organizations,
    repository,
    service,
    setConnections(value: readonly IntegrationProvider[]) {
      connections = [...value];
    },
  };
}

const objective = "Make sure good inbound sales leads never fall through the cracks";

describe("BuilderService", () => {
  it("starts a tenant-owned session with a compiled, reviewable proposal", async () => {
    const { model, organizations, service } = fixture(["gmail", "hubspot", "slack"]);

    const session = await service.start({
      organizationId: "org_a",
      userId: "user_a",
      objective,
      constraints: ["Never contact a lead without approval"],
    });

    expect(session).toMatchObject({ organizationId: "org_a", createdBy: "user_a", revision: 1, status: "READY" });
    expect(session.proposals).toHaveLength(1);
    expect(session.proposals[0]?.proposal.diff).toEqual([expect.objectContaining({ path: "$", kind: "added" })]);
    expect(model.calls[0]).toMatchObject({
      objective,
      constraints: ["Never contact a lead without approval"],
    });
    expect(organizations).toEqual(["org_a"]);
  });

  it("refines against the latest spec and retains earlier constraints", async () => {
    const { model, service } = fixture(["gmail", "hubspot", "slack"]);
    const started = await service.start({
      organizationId: "org_a",
      userId: "user_a",
      objective,
      constraints: ["Only handle enquiries from the website"],
    });

    const refined = await service.refine({
      organizationId: "org_a",
      sessionId: started.id,
      expectedRevision: 1,
      message: "Route enterprise leads to the sales manager",
    });

    expect(refined.revision).toBe(2);
    expect(refined.proposals[1]?.proposal.diff.map(({ path }) => path)).toContain("instructions");
    expect(model.calls[1]?.constraints).toEqual([
      "Only handle enquiries from the website",
      "Route enterprise leads to the sales manager",
    ]);
    expect(model.calls[1]?.baseSpec).toEqual(started.proposals[0]?.proposal.spec);

    await service.refine({
      organizationId: "org_a",
      sessionId: started.id,
      expectedRevision: 2,
      message: "Label qualified leads as priority",
    });
    expect(model.calls[2]?.constraints).toEqual([
      "Only handle enquiries from the website",
      "Route enterprise leads to the sales manager",
      "Label qualified leads as priority",
    ]);
  });

  it("surfaces missing connections as deployment readiness blockers", async () => {
    const { service, setConnections } = fixture(["gmail"]);
    const started = await service.start({ organizationId: "org_a", userId: "user_a", objective });

    expect(started.status).toBe("OPEN");
    expect(started.proposals[0]?.proposal.missingConnections).toEqual(["hubspot", "slack"]);
    expect(started.proposals[0]?.proposal.readiness).toMatchObject({ ready: false });

    setConnections(["gmail", "hubspot", "slack"]);
    const refined = await service.refine({
      organizationId: "org_a",
      sessionId: started.id,
      expectedRevision: 1,
      message: "Keep the same governed workflow",
    });
    expect(refined.status).toBe("READY");
    expect(refined.proposals[1]?.proposal.missingConnections).toEqual([]);
    expect(refined.proposals[1]?.proposal.readiness.ready).toBe(true);
  });

  it("rejects stale writes before compiling another proposal", async () => {
    const { model, service } = fixture();
    const started = await service.start({ organizationId: "org_a", userId: "user_a", objective });

    await expect(service.refine({
      organizationId: "org_a",
      sessionId: started.id,
      expectedRevision: 0,
      message: "This edit is stale",
    })).rejects.toThrow("BUILDER_REVISION_CONFLICT");
    expect(model.calls).toHaveLength(1);

    await expect(service.abandon({
      organizationId: "org_a",
      sessionId: started.id,
      expectedRevision: 0,
    })).rejects.toThrow("BUILDER_REVISION_CONFLICT");
  });

  it("does not reveal or modify another tenant's builder session", async () => {
    const { service } = fixture();
    const started = await service.start({ organizationId: "org_a", userId: "user_a", objective });

    await expect(service.get({ organizationId: "org_b", sessionId: started.id })).resolves.toBeUndefined();
    await expect(service.refine({
      organizationId: "org_b",
      sessionId: started.id,
      expectedRevision: 1,
      message: "Cross-tenant edit",
    })).rejects.toThrow("BUILDER_SESSION_NOT_FOUND");
    await expect(service.abandon({
      organizationId: "org_b",
      sessionId: started.id,
      expectedRevision: 1,
    })).rejects.toThrow("BUILDER_SESSION_NOT_FOUND");
  });

  it("redacts and bounds retained constraints before model or repository use", async () => {
    const { model, service } = fixture();
    const constraints = [
      "api_key=sk-1234567890abcdefgh",
      ...Array.from({ length: 24 }, (_, index) => `Constraint ${index}: ${"x".repeat(600)}`),
    ];
    const started = await service.start({
      organizationId: "org_a",
      userId: "user_a",
      objective,
      constraints,
    });

    expect(model.calls[0]?.constraints.length).toBeLessThanOrEqual(20);
    expect(model.calls[0]?.constraints.every((constraint) => constraint.length <= 500)).toBe(true);
    expect(JSON.stringify(model.calls[0])).not.toContain("sk-1234567890abcdefgh");
    expect(started.messages[0]?.content.length).toBeLessThanOrEqual(4_000);
    expect(started.messages[0]?.content).not.toContain("sk-1234567890abcdefgh");

    for (let revision = 1; revision <= 22; revision += 1) {
      await service.refine({
        organizationId: "org_a",
        sessionId: started.id,
        expectedRevision: revision,
        message: `Refinement ${revision}: ${"y".repeat(600)}`,
      });
    }
    const finalCall = model.calls.at(-1);
    expect(finalCall?.constraints).toHaveLength(20);
    expect(finalCall?.constraints.at(-1)).toBe(`Refinement 22: ${"y".repeat(485)}`);
    expect(finalCall?.constraints.every((constraint) => constraint.length <= 500)).toBe(true);
  });
});
