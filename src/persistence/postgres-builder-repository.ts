import { and, asc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import {
  redactBuilderMessage,
  validateBuilderProposal,
  type AppendBuilderProposalInput,
  type BuilderMessage,
  type BuilderProposalRevision,
  type BuilderSession,
  type BuilderSessionRepository,
  type CreateBuilderSessionInput,
} from "@/application/builder/session";
import type { WorkerProposal } from "@/application/builder/proposal";
import { getDatabase } from "@/db/client-core";
import * as schema from "@/db/schema";
import { canonicalJson, hashWorkerSpec } from "@/domain/canonical-json";
import { parseWorkerSpec } from "@/domain/worker-spec";

type BuilderDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
type BuilderTransaction = Parameters<Parameters<BuilderDatabase["transaction"]>[0]>[0];

function asIsoString(value: Date): string {
  return value.toISOString();
}

function validatedStoredProposal(row: typeof schema.builderProposals.$inferSelect): WorkerProposal {
  const proposal = validateBuilderProposal(row.proposalJson as unknown as WorkerProposal);
  const storedSpec = parseWorkerSpec(row.specJson);
  const storedHash = hashWorkerSpec(storedSpec);
  if (
    row.specHash !== storedHash
    || row.specHash !== proposal.specHash
    || canonicalJson(storedSpec) !== canonicalJson(proposal.spec)
  ) {
    throw new Error("BUILDER_PROPOSAL_INTEGRITY_ERROR");
  }
  return proposal;
}

export class PostgresBuilderSessionRepository implements BuilderSessionRepository {
  constructor(private readonly database: BuilderDatabase = getDatabase()) {}

  private async load(
    database: BuilderDatabase | BuilderTransaction,
    organizationId: string,
    sessionId: string,
  ): Promise<BuilderSession | undefined> {
    const [session] = await database
      .select()
      .from(schema.builderSessions)
      .where(and(
        eq(schema.builderSessions.organizationId, organizationId),
        eq(schema.builderSessions.id, sessionId),
      ))
      .limit(1);
    if (!session) return undefined;

    const messages = await database
      .select()
      .from(schema.builderMessages)
      .where(and(
        eq(schema.builderMessages.organizationId, organizationId),
        eq(schema.builderMessages.sessionId, sessionId),
      ))
      .orderBy(asc(schema.builderMessages.sequence));
    const proposals = await database
      .select()
      .from(schema.builderProposals)
      .where(and(
        eq(schema.builderProposals.organizationId, organizationId),
        eq(schema.builderProposals.sessionId, sessionId),
      ))
      .orderBy(asc(schema.builderProposals.revision));

    return {
      id: session.id,
      organizationId: session.organizationId,
      ...(session.workerId ? { workerId: session.workerId } : {}),
      ...(session.baseWorkerVersionId ? { baseWorkerVersionId: session.baseWorkerVersionId } : {}),
      status: session.status,
      revision: session.revision,
      createdBy: session.createdBy,
      ...(session.committedWorkerVersionId
        ? { committedWorkerVersionId: session.committedWorkerVersionId }
        : {}),
      createdAt: asIsoString(session.createdAt),
      updatedAt: asIsoString(session.updatedAt),
      messages: messages.map((message): BuilderMessage => ({
        id: message.id,
        organizationId: message.organizationId,
        sessionId: message.sessionId,
        sequence: message.sequence,
        role: message.role,
        content: message.content,
        createdAt: asIsoString(message.createdAt),
      })),
      proposals: proposals.map((proposal): BuilderProposalRevision => ({
        id: proposal.id,
        organizationId: proposal.organizationId,
        sessionId: proposal.sessionId,
        revision: proposal.revision,
        proposal: validatedStoredProposal(proposal),
        createdAt: asIsoString(proposal.createdAt),
      })),
    };
  }

  private async assertReferences(input: CreateBuilderSessionInput): Promise<void> {
    const [membership] = await this.database
      .select({ organizationId: schema.organizationMemberships.organizationId })
      .from(schema.organizationMemberships)
      .where(and(
        eq(schema.organizationMemberships.organizationId, input.organizationId),
        eq(schema.organizationMemberships.userId, input.createdBy),
      ))
      .limit(1);
    if (!membership) throw new Error("BUILDER_CREATOR_NOT_IN_ORGANIZATION");

    if (input.workerId) {
      const [worker] = await this.database
        .select({ id: schema.workers.id })
        .from(schema.workers)
        .where(and(
          eq(schema.workers.organizationId, input.organizationId),
          eq(schema.workers.id, input.workerId),
        ))
        .limit(1);
      if (!worker) throw new Error("BUILDER_WORKER_NOT_FOUND");
    }

    if (input.baseWorkerVersionId) {
      const conditions = [
        eq(schema.workerVersions.organizationId, input.organizationId),
        eq(schema.workerVersions.id, input.baseWorkerVersionId),
      ];
      if (input.workerId) conditions.push(eq(schema.workerVersions.workerId, input.workerId));
      const [version] = await this.database
        .select({ id: schema.workerVersions.id })
        .from(schema.workerVersions)
        .where(and(...conditions))
        .limit(1);
      if (!version) throw new Error("BUILDER_BASE_VERSION_NOT_FOUND");
    }
  }

  async create(input: CreateBuilderSessionInput): Promise<BuilderSession> {
    await this.assertReferences(input);
    const [created] = await this.database
      .insert(schema.builderSessions)
      .values({
        organizationId: input.organizationId,
        createdBy: input.createdBy,
        workerId: input.workerId,
        baseWorkerVersionId: input.baseWorkerVersionId,
      })
      .returning({ id: schema.builderSessions.id });
    if (!created) throw new Error("BUILDER_SESSION_CREATE_FAILED");
    const session = await this.load(this.database, input.organizationId, created.id);
    if (!session) throw new Error("BUILDER_SESSION_CREATE_FAILED");
    return session;
  }

  async get(organizationId: string, sessionId: string): Promise<BuilderSession | undefined> {
    return this.load(this.database, organizationId, sessionId);
  }

  async appendProposal(input: AppendBuilderProposalInput): Promise<BuilderSession> {
    return this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select({
          revision: schema.builderSessions.revision,
          status: schema.builderSessions.status,
        })
        .from(schema.builderSessions)
        .where(and(
          eq(schema.builderSessions.organizationId, input.organizationId),
          eq(schema.builderSessions.id, input.sessionId),
        ))
        .limit(1);
      if (!current) throw new Error("BUILDER_SESSION_NOT_FOUND");
      if (current.status === "COMMITTED" || current.status === "ABANDONED") {
        throw new Error("BUILDER_SESSION_CLOSED");
      }
      if (current.revision !== input.expectedRevision) throw new Error("BUILDER_REVISION_CONFLICT");

      const safeMessage = redactBuilderMessage(input.userMessage);
      if (!safeMessage) throw new Error("BUILDER_MESSAGE_REQUIRED");
      const safeProposal = validateBuilderProposal(input.proposal);
      const revision = input.expectedRevision + 1;
      const now = new Date();
      const [updated] = await transaction
        .update(schema.builderSessions)
        .set({
          revision,
          status: safeProposal.readiness.ready ? "READY" : "OPEN",
          updatedAt: now,
        })
        .where(and(
          eq(schema.builderSessions.organizationId, input.organizationId),
          eq(schema.builderSessions.id, input.sessionId),
          eq(schema.builderSessions.revision, input.expectedRevision),
          inArray(schema.builderSessions.status, ["OPEN", "READY"]),
        ))
        .returning({ id: schema.builderSessions.id });

      if (!updated) {
        const current = await this.load(transaction, input.organizationId, input.sessionId);
        if (!current) throw new Error("BUILDER_SESSION_NOT_FOUND");
        if (current.status === "COMMITTED" || current.status === "ABANDONED") {
          throw new Error("BUILDER_SESSION_CLOSED");
        }
        throw new Error("BUILDER_REVISION_CONFLICT");
      }

      await transaction.insert(schema.builderMessages).values({
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        sequence: revision,
        role: "user",
        content: safeMessage,
        createdAt: now,
      });
      await transaction.insert(schema.builderProposals).values({
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        revision,
        specJson: safeProposal.spec as unknown as Record<string, unknown>,
        specHash: safeProposal.specHash,
        proposalJson: safeProposal as unknown as Record<string, unknown>,
        createdAt: now,
      });

      const session = await this.load(transaction, input.organizationId, input.sessionId);
      if (!session) throw new Error("BUILDER_SESSION_NOT_FOUND");
      return session;
    });
  }

  async abandon(
    organizationId: string,
    sessionId: string,
    expectedRevision: number,
  ): Promise<BuilderSession> {
    return this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(schema.builderSessions)
        .set({ status: "ABANDONED", updatedAt: new Date() })
        .where(and(
          eq(schema.builderSessions.organizationId, organizationId),
          eq(schema.builderSessions.id, sessionId),
          eq(schema.builderSessions.revision, expectedRevision),
          inArray(schema.builderSessions.status, ["OPEN", "READY"]),
        ))
        .returning({ id: schema.builderSessions.id });

      if (!updated) {
        const current = await this.load(transaction, organizationId, sessionId);
        if (!current) throw new Error("BUILDER_SESSION_NOT_FOUND");
        if (current.status === "COMMITTED" || current.status === "ABANDONED") {
          throw new Error("BUILDER_SESSION_CLOSED");
        }
        throw new Error("BUILDER_REVISION_CONFLICT");
      }

      const session = await this.load(transaction, organizationId, sessionId);
      if (!session) throw new Error("BUILDER_SESSION_NOT_FOUND");
      return session;
    });
  }
}
