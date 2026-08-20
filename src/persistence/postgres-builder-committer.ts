import { and, desc, eq, inArray } from "drizzle-orm";

import type {
  BuilderCommitResult,
  BuilderProposalCommitter,
  CommitBuilderProposalInput,
} from "@/application/builder/session";
import { getDatabase } from "@/db/client-core";
import * as schema from "@/db/schema";
import {
  loadBuilderSession,
  validatedStoredProposal,
  type BuilderDatabase,
} from "@/persistence/postgres-builder-repository";

const maximumPostgresInteger = 2_147_483_647;

export class PostgresBuilderProposalCommitter implements BuilderProposalCommitter {
  constructor(
    private readonly database: BuilderDatabase = getDatabase(),
    private readonly actorType: "user" | "mcp" = "user",
  ) {}

  async commit(input: CommitBuilderProposalInput): Promise<BuilderCommitResult> {
    return this.database.transaction(async (transaction) => {
      if (typeof input.expectedSpecHash !== "string" || !input.expectedSpecHash.trim()) {
        throw new Error("BUILDER_EXPECTED_SPEC_HASH_REQUIRED");
      }

      const [current] = await transaction
        .select()
        .from(schema.builderSessions)
        .where(and(
          eq(schema.builderSessions.organizationId, input.organizationId),
          eq(schema.builderSessions.id, input.sessionId),
        ))
        .limit(1)
        .for("update");
      if (!current) throw new Error("BUILDER_SESSION_NOT_FOUND");
      if (current.status !== "OPEN" && current.status !== "READY") {
        throw new Error("BUILDER_SESSION_CLOSED");
      }
      if (current.revision !== input.expectedRevision) throw new Error("BUILDER_REVISION_CONFLICT");

      const [latestRow] = await transaction
        .select()
        .from(schema.builderProposals)
        .where(and(
          eq(schema.builderProposals.organizationId, input.organizationId),
          eq(schema.builderProposals.sessionId, input.sessionId),
        ))
        .orderBy(desc(schema.builderProposals.revision))
        .limit(1);
      if (!latestRow || latestRow.revision !== current.revision) {
        throw new Error("BUILDER_PROPOSAL_NOT_FOUND");
      }

      const proposal = validatedStoredProposal(latestRow);
      if (proposal.specHash !== input.expectedSpecHash) throw new Error("BUILDER_PROPOSAL_CHANGED");

      let workerId = current.workerId;
      let createdWorker = false;
      let versionNumber = 1;

      if (workerId) {
        const [worker] = await transaction
          .select()
          .from(schema.workers)
          .where(and(
            eq(schema.workers.organizationId, input.organizationId),
            eq(schema.workers.id, workerId),
          ))
          .limit(1)
          .for("update");
        if (!worker) throw new Error("BUILDER_WORKER_NOT_FOUND");

        const [latestVersion] = await transaction
          .select({ versionNumber: schema.workerVersions.versionNumber })
          .from(schema.workerVersions)
          .where(and(
            eq(schema.workerVersions.organizationId, input.organizationId),
            eq(schema.workerVersions.workerId, workerId),
          ))
          .orderBy(desc(schema.workerVersions.versionNumber))
          .limit(1);
        if (latestVersion) {
          if (
            !Number.isSafeInteger(latestVersion.versionNumber)
            || latestVersion.versionNumber < 1
            || latestVersion.versionNumber >= maximumPostgresInteger
          ) {
            throw new Error("BUILDER_VERSION_NUMBER_INVALID");
          }
          versionNumber = latestVersion.versionNumber + 1;
        }

        const preservesDeployment = worker.status === "DEPLOYED" || worker.status === "PAUSED";
        await transaction
          .update(schema.workers)
          .set({
            name: proposal.spec.identity.name,
            ...(preservesDeployment
              ? {}
              : { status: proposal.readiness.ready ? "READY" as const : "DRAFT" as const, archivedAt: null }),
            updatedAt: new Date(),
          })
          .where(and(
            eq(schema.workers.organizationId, input.organizationId),
            eq(schema.workers.id, workerId),
          ));
      } else {
        const [created] = await transaction
          .insert(schema.workers)
          .values({
            organizationId: input.organizationId,
            name: proposal.spec.identity.name,
            status: proposal.readiness.ready ? "READY" : "DRAFT",
            createdBy: current.createdBy,
          })
          .returning({ id: schema.workers.id });
        if (!created) throw new Error("BUILDER_WORKER_CREATE_FAILED");
        workerId = created.id;
        createdWorker = true;
      }

      const [createdVersion] = await transaction
        .insert(schema.workerVersions)
        .values({
          organizationId: input.organizationId,
          workerId,
          versionNumber,
          specJson: proposal.spec as unknown as Record<string, unknown>,
          specHash: proposal.specHash,
          createdBy: current.createdBy,
        })
        .returning({ id: schema.workerVersions.id });
      if (!createdVersion) throw new Error("BUILDER_WORKER_VERSION_CREATE_FAILED");

      await transaction.insert(schema.auditEvents).values({
        organizationId: input.organizationId,
        actorType: this.actorType,
        actorId: current.createdBy,
        action: createdWorker ? "worker.created_from_builder" : "worker.version_created_from_builder",
        targetType: "worker",
        targetId: workerId,
        metadataJson: {
          builderSessionId: input.sessionId,
          workerVersionId: createdVersion.id,
          versionNumber,
          specHash: proposal.specHash,
        },
      });

      const [committed] = await transaction
        .update(schema.builderSessions)
        .set({
          workerId,
          committedWorkerVersionId: createdVersion.id,
          status: "COMMITTED",
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.builderSessions.organizationId, input.organizationId),
          eq(schema.builderSessions.id, input.sessionId),
          eq(schema.builderSessions.revision, input.expectedRevision),
          inArray(schema.builderSessions.status, ["OPEN", "READY"]),
        ))
        .returning({ id: schema.builderSessions.id });
      if (!committed) throw new Error("BUILDER_REVISION_CONFLICT");

      const session = await loadBuilderSession(transaction, input.organizationId, input.sessionId);
      if (!session) throw new Error("BUILDER_SESSION_NOT_FOUND");
      return {
        session,
        workerId,
        workerVersionId: createdVersion.id,
        versionNumber,
        createdWorker,
      };
    });
  }
}
