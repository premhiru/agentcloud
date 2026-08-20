import { PGlite } from "@electric-sql/pglite";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createWorkerProposal } from "@/application/builder/proposal";
import * as schema from "@/db/schema";
import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";
import { PostgresBuilderProposalCommitter } from "@/persistence/postgres-builder-committer";
import { PostgresBuilderSessionRepository } from "@/persistence/postgres-builder-repository";

const organizationA = "30000000-0000-4000-8000-000000000001";
const organizationB = "30000000-0000-4000-8000-000000000002";
const userA = "40000000-0000-4000-8000-000000000001";
const userB = "40000000-0000-4000-8000-000000000002";

function proposal(missingConnections: Array<"gmail" | "hubspot" | "slack"> = []) {
  return createWorkerProposal({
    spec: inboundSalesWorkerSpec(),
    requiredConnections: ["gmail", "hubspot", "slack"],
    missingConnections,
    unsupportedCapabilities: [],
    warnings: [],
    questions: [],
    summary: "A governed inbound sales worker.",
  });
}

let client: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
let repository: PostgresBuilderSessionRepository;
let committer: PostgresBuilderProposalCommitter;

describe("PostgresBuilderProposalCommitter", () => {
  beforeAll(async () => {
    client = new PGlite();
    database = drizzle(client, { schema });
    await migrate(database, { migrationsFolder: "./drizzle" });
    await database.insert(schema.organizations).values([
      { id: organizationA, clerkOrganizationId: "clerk_org_commit_a", name: "Commit A", slug: "commit-a" },
      { id: organizationB, clerkOrganizationId: "clerk_org_commit_b", name: "Commit B", slug: "commit-b" },
    ]);
    await database.insert(schema.users).values([
      { id: userA, clerkUserId: "clerk_user_commit_a", email: "commit-a@example.com" },
      { id: userB, clerkUserId: "clerk_user_commit_b", email: "commit-b@example.com" },
    ]);
    await database.insert(schema.organizationMemberships).values([
      { organizationId: organizationA, userId: userA, role: "owner" },
      { organizationId: organizationB, userId: userB, role: "owner" },
    ]);
    repository = new PostgresBuilderSessionRepository(database);
    committer = new PostgresBuilderProposalCommitter(database);
  }, 30_000);

  afterAll(async () => client.close());

  it("requires the exact proposal hash and creates a ready worker with version one", async () => {
    const session = await repository.create({ organizationId: organizationA, createdBy: userA });
    const readyProposal = proposal();
    const ready = await repository.appendProposal({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: 0,
      userMessage: "Create this worker",
      proposal: readyProposal,
    });

    await expect(committer.commit({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: ready.revision,
      expectedSpecHash: " ",
    })).rejects.toThrow("BUILDER_EXPECTED_SPEC_HASH_REQUIRED");
    await expect(committer.commit({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: ready.revision,
      expectedSpecHash: "wrong-hash",
    })).rejects.toThrow("BUILDER_PROPOSAL_CHANGED");

    const result = await committer.commit({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: ready.revision,
      expectedSpecHash: readyProposal.specHash,
    });

    expect(result).toMatchObject({ versionNumber: 1, createdWorker: true });
    expect(result.session).toMatchObject({
      status: "COMMITTED",
      workerId: result.workerId,
      committedWorkerVersionId: result.workerVersionId,
    });
    const [worker] = await database
      .select()
      .from(schema.workers)
      .where(and(eq(schema.workers.organizationId, organizationA), eq(schema.workers.id, result.workerId)));
    const [version] = await database
      .select()
      .from(schema.workerVersions)
      .where(and(
        eq(schema.workerVersions.organizationId, organizationA),
        eq(schema.workerVersions.id, result.workerVersionId),
      ));
    expect(worker).toMatchObject({ status: "READY", activeVersionId: null });
    expect(version).toMatchObject({
      workerId: result.workerId,
      versionNumber: 1,
      specHash: readyProposal.specHash,
      createdBy: userA,
    });
    const audit = await database
      .select()
      .from(schema.auditEvents)
      .where(and(
        eq(schema.auditEvents.organizationId, organizationA),
        eq(schema.auditEvents.targetId, result.workerId),
      ));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorType: "user",
      actorId: userA,
      action: "worker.created_from_builder",
      targetType: "worker",
      metadataJson: {
        builderSessionId: session.id,
        workerVersionId: result.workerVersionId,
        versionNumber: 1,
        specHash: readyProposal.specHash,
      },
    });
  });

  it("records MCP proposal commits with an MCP audit actor", async () => {
    const session = await repository.create({ organizationId: organizationA, createdBy: userA });
    const readyProposal = proposal();
    const ready = await repository.appendProposal({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: 0,
      userMessage: "Commit from the authenticated MCP",
      proposal: readyProposal,
    });
    const mcpCommitter = new PostgresBuilderProposalCommitter(database, "mcp");
    const result = await mcpCommitter.commit({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: ready.revision,
      expectedSpecHash: readyProposal.specHash,
    });

    const [audit] = await database
      .select()
      .from(schema.auditEvents)
      .where(and(
        eq(schema.auditEvents.organizationId, organizationA),
        eq(schema.auditEvents.targetId, result.workerId),
      ));
    expect(audit).toMatchObject({
      actorType: "mcp",
      actorId: userA,
      action: "worker.created_from_builder",
    });
  });

  it("appends an immutable version without changing a deployed worker's active version", async () => {
    const baseProposal = proposal();
    const [worker] = await database.insert(schema.workers).values({
      organizationId: organizationA,
      name: "Already deployed",
      status: "DEPLOYED",
      createdBy: userA,
    }).returning();
    const [baseVersion] = await database.insert(schema.workerVersions).values({
      organizationId: organizationA,
      workerId: worker!.id,
      versionNumber: 7,
      specJson: baseProposal.spec as unknown as Record<string, unknown>,
      specHash: baseProposal.specHash,
      createdBy: userA,
      deployedAt: new Date("2026-01-01T00:00:00.000Z"),
    }).returning();
    await database.update(schema.workers)
      .set({ activeVersionId: baseVersion!.id })
      .where(and(eq(schema.workers.organizationId, organizationA), eq(schema.workers.id, worker!.id)));

    const session = await repository.create({
      organizationId: organizationA,
      createdBy: userA,
      workerId: worker!.id,
      baseWorkerVersionId: baseVersion!.id,
    });
    const nextProposal = proposal();
    const ready = await repository.appendProposal({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: 0,
      userMessage: "Prepare the next immutable version",
      proposal: nextProposal,
    });
    const result = await committer.commit({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: ready.revision,
      expectedSpecHash: nextProposal.specHash,
    });

    expect(result).toMatchObject({
      workerId: worker!.id,
      versionNumber: 8,
      createdWorker: false,
    });
    const [persistedWorker] = await database.select().from(schema.workers).where(and(
      eq(schema.workers.organizationId, organizationA),
      eq(schema.workers.id, worker!.id),
    ));
    expect(persistedWorker).toMatchObject({
      status: "DEPLOYED",
      activeVersionId: baseVersion!.id,
    });
    const versions = await database.select().from(schema.workerVersions).where(and(
      eq(schema.workerVersions.organizationId, organizationA),
      eq(schema.workerVersions.workerId, worker!.id),
    )).orderBy(asc(schema.workerVersions.versionNumber));
    expect(versions.map((version) => version.versionNumber)).toEqual([7, 8]);
    expect(versions[0]).toMatchObject({
      id: baseVersion!.id,
      specHash: baseProposal.specHash,
      deployedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  it("commits a session only once", async () => {
    const session = await repository.create({ organizationId: organizationA, createdBy: userA });
    const readyProposal = proposal();
    const ready = await repository.appendProposal({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: 0,
      userMessage: "Commit once",
      proposal: readyProposal,
    });
    const input = {
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: ready.revision,
      expectedSpecHash: readyProposal.specHash,
    } as const;
    const first = await committer.commit(input);

    await expect(committer.commit(input)).rejects.toThrow("BUILDER_SESSION_CLOSED");
    const versions = await database.select().from(schema.workerVersions).where(and(
      eq(schema.workerVersions.organizationId, organizationA),
      eq(schema.workerVersions.workerId, first.workerId),
    ));
    expect(versions).toHaveLength(1);
  });

  it("denies a cross-tenant commit without modifying the owning session", async () => {
    const session = await repository.create({ organizationId: organizationA, createdBy: userA });
    const readyProposal = proposal();
    const ready = await repository.appendProposal({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: 0,
      userMessage: "Tenant A proposal",
      proposal: readyProposal,
    });

    await expect(committer.commit({
      organizationId: organizationB,
      sessionId: session.id,
      expectedRevision: ready.revision,
      expectedSpecHash: readyProposal.specHash,
    })).rejects.toThrow("BUILDER_SESSION_NOT_FOUND");
    const unchanged = await repository.get(organizationA, session.id);
    expect(unchanged).toMatchObject({ status: "READY" });
    expect(unchanged).not.toHaveProperty("workerId");
    expect(unchanged).not.toHaveProperty("committedWorkerVersionId");
  });

  it("rolls back completely when the stored proposal is corrupt", async () => {
    const workersBefore = await database.select({ id: schema.workers.id }).from(schema.workers);
    const versionsBefore = await database.select({ id: schema.workerVersions.id }).from(schema.workerVersions);
    const session = await repository.create({ organizationId: organizationA, createdBy: userA });
    const readyProposal = proposal();
    const ready = await repository.appendProposal({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: 0,
      userMessage: "Corrupt this before commit",
      proposal: readyProposal,
    });
    await database.update(schema.builderProposals)
      .set({ specHash: "corrupted" })
      .where(and(
        eq(schema.builderProposals.organizationId, organizationA),
        eq(schema.builderProposals.sessionId, session.id),
      ));

    await expect(committer.commit({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: ready.revision,
      expectedSpecHash: readyProposal.specHash,
    })).rejects.toThrow("BUILDER_PROPOSAL_INTEGRITY_ERROR");

    const [storedSession] = await database.select().from(schema.builderSessions).where(and(
      eq(schema.builderSessions.organizationId, organizationA),
      eq(schema.builderSessions.id, session.id),
    ));
    expect(storedSession).toMatchObject({
      status: "READY",
      workerId: null,
      committedWorkerVersionId: null,
    });
    expect(await database.select({ id: schema.workers.id }).from(schema.workers)).toHaveLength(workersBefore.length);
    expect(await database.select({ id: schema.workerVersions.id }).from(schema.workerVersions))
      .toHaveLength(versionsBefore.length);
  });
});
