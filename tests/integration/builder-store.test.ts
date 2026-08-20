import { PGlite } from "@electric-sql/pglite";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createWorkerProposal } from "@/application/builder/proposal";
import * as schema from "@/db/schema";
import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";
import { PostgresBuilderSessionRepository } from "@/persistence/postgres-builder-repository";

const organizationA = "10000000-0000-4000-8000-000000000001";
const organizationB = "10000000-0000-4000-8000-000000000002";
const userA = "20000000-0000-4000-8000-000000000001";
const userB = "20000000-0000-4000-8000-000000000002";

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

describe("PostgresBuilderSessionRepository", () => {
  beforeAll(async () => {
    client = new PGlite();
    database = drizzle(client, { schema });
    await migrate(database, { migrationsFolder: "./drizzle" });
    await database.insert(schema.organizations).values([
      { id: organizationA, clerkOrganizationId: "clerk_org_builder_a", name: "Builder A", slug: "builder-a" },
      { id: organizationB, clerkOrganizationId: "clerk_org_builder_b", name: "Builder B", slug: "builder-b" },
    ]);
    await database.insert(schema.users).values([
      { id: userA, clerkUserId: "clerk_user_builder_a", email: "builder-a@example.com" },
      { id: userB, clerkUserId: "clerk_user_builder_b", email: "builder-b@example.com" },
    ]);
    await database.insert(schema.organizationMemberships).values([
      { organizationId: organizationA, userId: userA, role: "owner" },
      { organizationId: organizationB, userId: userB, role: "owner" },
    ]);
    repository = new PostgresBuilderSessionRepository(database);
  }, 30_000);

  afterAll(async () => client.close());

  it("keeps every session operation isolated to its organization", async () => {
    const session = await repository.create({ organizationId: organizationA, createdBy: userA });

    await expect(repository.create({ organizationId: organizationA, createdBy: userB }))
      .rejects.toThrow("BUILDER_CREATOR_NOT_IN_ORGANIZATION");
    expect(await repository.get(organizationB, session.id)).toBeUndefined();
    await expect(repository.appendProposal({
      organizationId: organizationB,
      sessionId: session.id,
      expectedRevision: 0,
      userMessage: "Cross-tenant edit",
      proposal: proposal(),
    })).rejects.toThrow("BUILDER_SESSION_NOT_FOUND");
    await expect(repository.abandon(organizationB, session.id, 0)).rejects.toThrow("BUILDER_SESSION_NOT_FOUND");

    expect(await repository.get(organizationA, session.id)).toMatchObject({
      organizationId: organizationA,
      revision: 0,
      status: "OPEN",
    });
  });

  it("appends immutable proposal revisions and rejects stale writers", async () => {
    const session = await repository.create({ organizationId: organizationA, createdBy: userA });
    const firstProposal = proposal(["gmail"]);
    await repository.appendProposal({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: 0,
      userMessage: "Build the worker",
      proposal: firstProposal,
    });
    const second = await repository.appendProposal({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: 1,
      userMessage: "Gmail is connected now",
      proposal: proposal(),
    });

    expect(second).toMatchObject({ revision: 2, status: "READY" });
    expect(second.proposals.map((item) => item.revision)).toEqual([1, 2]);
    expect(second.proposals[0]?.proposal.missingConnections).toEqual(["gmail"]);
    const rows = await database
      .select()
      .from(schema.builderProposals)
      .where(and(
        eq(schema.builderProposals.organizationId, organizationA),
        eq(schema.builderProposals.sessionId, session.id),
      ))
      .orderBy(asc(schema.builderProposals.revision));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ revision: 1, specHash: firstProposal.specHash });

    await expect(repository.appendProposal({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: 1,
      userMessage: "Stale edit",
      proposal: proposal(),
    })).rejects.toThrow("BUILDER_REVISION_CONFLICT");
    expect(await repository.get(organizationA, session.id)).toMatchObject({ revision: 2 });
  });

  it("redacts messages before persistence and rejects empty messages without advancing", async () => {
    const session = await repository.create({ organizationId: organizationA, createdBy: userA });
    await expect(repository.appendProposal({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: 0,
      userMessage: "   ",
      proposal: proposal(),
    })).rejects.toThrow("BUILDER_MESSAGE_REQUIRED");
    const updated = await repository.appendProposal({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: 0,
      userMessage: "Use api_key=sk-1234567890abcdefgh and password=hunter2",
      proposal: proposal(),
    });

    expect(updated.messages[0]?.content).toBe("Use api_key=[REDACTED] and password=[REDACTED]");
    const [stored] = await database
      .select({ content: schema.builderMessages.content })
      .from(schema.builderMessages)
      .where(and(
        eq(schema.builderMessages.organizationId, organizationA),
        eq(schema.builderMessages.sessionId, session.id),
      ));
    expect(stored?.content).not.toContain("hunter2");
    expect(updated.revision).toBe(1);
  });

  it("fails closed when explicit proposal integrity fields are corrupted", async () => {
    const session = await repository.create({ organizationId: organizationA, createdBy: userA });
    await repository.appendProposal({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: 0,
      userMessage: "Build the worker",
      proposal: proposal(),
    });
    await database
      .update(schema.builderProposals)
      .set({ specHash: "corrupted" })
      .where(and(
        eq(schema.builderProposals.organizationId, organizationA),
        eq(schema.builderProposals.sessionId, session.id),
      ));

    await expect(repository.get(organizationA, session.id)).rejects.toThrow("BUILDER_PROPOSAL_INTEGRITY_ERROR");
  });

  it("abandons only the expected open revision", async () => {
    const session = await repository.create({ organizationId: organizationA, createdBy: userA });
    await expect(repository.abandon(organizationA, session.id, 1)).rejects.toThrow("BUILDER_REVISION_CONFLICT");
    const abandoned = await repository.abandon(organizationA, session.id, 0);
    expect(abandoned.status).toBe("ABANDONED");
    await expect(repository.appendProposal({
      organizationId: organizationA,
      sessionId: session.id,
      expectedRevision: 0,
      userMessage: "Too late",
      proposal: proposal(),
    })).rejects.toThrow("BUILDER_SESSION_CLOSED");
  });
});
