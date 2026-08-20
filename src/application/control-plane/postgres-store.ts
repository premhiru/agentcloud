import "server-only";

import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import { wait } from "@trigger.dev/sdk";

import { compileWorker } from "@/application/compiler/compiler";
import type { UiApproval, UiAuditEvent, UiConnection, UiRun, UiWorker, UiWorkerVersion } from "@/application/control-plane/demo-store";
import { hashWorkerSpec } from "@/domain/canonical-json";
import { getCapability } from "@/domain/tool-registry";
import { parseWorkerSpec } from "@/domain/worker-spec";
import { getDatabase } from "@/db/client";
import { approvals, auditEvents, connections, runs, runSteps, runtimeDeployments, workerTriggers, workerVersions, workers } from "@/db/schema";
import { resolveTenantIds, type TenantIds } from "@/lib/auth/tenant-ids";
import type { TenantContext } from "@/lib/auth/tenant-context";
import { requireOwner } from "@/lib/auth/tenant-context";
import { OpenAICompilerModel } from "@/models/openai-adapters";
import { TriggerDevRuntime } from "@/runtime/trigger-dev-runtime";
import type { RuntimeDeployment } from "@/runtime/types";

export class PostgresControlPlaneStore {
  private readonly runtime = new TriggerDevRuntime();

  private async tenant(context: TenantContext): Promise<TenantIds> {
    return resolveTenantIds(context);
  }

  private async audit(context: TenantContext, tenant: TenantIds, action: string, targetType: string, targetId: string, metadataJson: Record<string, unknown> = {}): Promise<void> {
    await getDatabase().insert(auditEvents).values({ organizationId: tenant.organizationId, actorType: context.source === "mcp" ? "mcp" : "user", actorId: tenant.userId, action, targetType, targetId, metadataJson });
  }

  private async versions(organizationId: string, workerId: string): Promise<UiWorkerVersion[]> {
    const rows = await getDatabase().select().from(workerVersions).where(and(eq(workerVersions.organizationId, organizationId), eq(workerVersions.workerId, workerId))).orderBy(asc(workerVersions.versionNumber));
    return rows.map((version) => ({ id: version.id, versionNumber: version.versionNumber, spec: parseWorkerSpec(version.specJson), specHash: version.specHash, createdAt: version.createdAt.toISOString(), deployedAt: version.deployedAt?.toISOString() }));
  }

  private async workerFromRow(organizationId: string, worker: typeof workers.$inferSelect): Promise<UiWorker> {
    return { id: worker.id, organizationId, name: worker.name, status: worker.status, activeVersionId: worker.activeVersionId ?? undefined, versions: await this.versions(organizationId, worker.id), createdAt: worker.createdAt.toISOString(), updatedAt: worker.updatedAt.toISOString() };
  }

  async listWorkers(context: TenantContext): Promise<UiWorker[]> {
    const tenant = await this.tenant(context); const rows = await getDatabase().select().from(workers).where(eq(workers.organizationId, tenant.organizationId)).orderBy(desc(workers.updatedAt));
    return Promise.all(rows.map((worker) => this.workerFromRow(tenant.organizationId, worker)));
  }

  async getWorker(context: TenantContext, workerId: string): Promise<UiWorker | undefined> {
    const tenant = await this.tenant(context); const [worker] = await getDatabase().select().from(workers).where(and(eq(workers.organizationId, tenant.organizationId), eq(workers.id, workerId))).limit(1);
    return worker ? this.workerFromRow(tenant.organizationId, worker) : undefined;
  }

  async createWorker(context: TenantContext, objective: string): Promise<UiWorker> {
    const tenant = await this.tenant(context); const db = getDatabase();
    const connectedRows = await db.select({ provider: connections.provider }).from(connections).where(and(eq(connections.organizationId, tenant.organizationId), eq(connections.status, "CONNECTED")));
    const compilation = await compileWorker({ objective, connectedIntegrations: connectedRows.map((row) => row.provider) }, new OpenAICompilerModel());
    const created = await db.transaction(async (tx) => {
      const [worker] = await tx.insert(workers).values({ organizationId: tenant.organizationId, name: compilation.spec.identity.name, status: "READY", createdBy: tenant.userId }).returning();
      if (!worker) throw new Error("WORKER_CREATE_FAILED");
      const [version] = await tx.insert(workerVersions).values({ organizationId: tenant.organizationId, workerId: worker.id, versionNumber: 1, specJson: compilation.spec, specHash: hashWorkerSpec(compilation.spec), createdBy: tenant.userId }).returning();
      if (!version) throw new Error("WORKER_VERSION_CREATE_FAILED");
      return worker;
    });
    await this.audit(context, tenant, "worker.created", "worker", created.id);
    return this.workerFromRow(tenant.organizationId, created);
  }

  async createWorkerVersion(context: TenantContext, workerId: string, objective: string): Promise<UiWorker> {
    const tenant = await this.tenant(context); const db = getDatabase(); const [worker] = await db.select().from(workers).where(and(eq(workers.organizationId, tenant.organizationId), eq(workers.id, workerId))).limit(1);
    if (!worker) throw new Error("WORKER_NOT_FOUND"); if (worker.status === "ARCHIVED") throw new Error("WORKER_ARCHIVED");
    const connectedRows = await db.select({ provider: connections.provider }).from(connections).where(and(eq(connections.organizationId, tenant.organizationId), eq(connections.status, "CONNECTED")));
    const compilation = await compileWorker({ objective, connectedIntegrations: connectedRows.map((row) => row.provider) }, new OpenAICompilerModel());
    const existing = await this.versions(tenant.organizationId, workerId); const versionNumber = (existing.at(-1)?.versionNumber ?? 0) + 1;
    const [version] = await db.insert(workerVersions).values({ organizationId: tenant.organizationId, workerId, versionNumber, specJson: compilation.spec, specHash: hashWorkerSpec(compilation.spec), createdBy: tenant.userId }).returning();
    if (!version) throw new Error("WORKER_VERSION_CREATE_FAILED");
    const [updated] = await db.update(workers).set({ name: compilation.spec.identity.name, updatedAt: new Date() }).where(and(eq(workers.organizationId, tenant.organizationId), eq(workers.id, workerId))).returning();
    await this.audit(context, tenant, "worker.version_created", "worker", workerId, { versionId: version.id });
    return this.workerFromRow(tenant.organizationId, updated!);
  }

  private async deployment(organizationId: string, workerId: string): Promise<{ row: typeof runtimeDeployments.$inferSelect; value: RuntimeDeployment } | undefined> {
    const [row] = await getDatabase().select().from(runtimeDeployments).where(and(eq(runtimeDeployments.organizationId, organizationId), eq(runtimeDeployments.workerId, workerId))).limit(1);
    if (!row) return undefined;
    return { row, value: { provider: row.provider, deploymentId: row.externalDeploymentId ?? `worker:${workerId}`, scheduleIds: (row.metadataJson.scheduleIds as Record<string, string> | undefined) ?? {} } };
  }

  async transition(context: TenantContext, workerId: string, action: "deploy" | "pause" | "resume" | "archive" | "rollback", versionId?: string): Promise<UiWorker> {
    requireOwner(context); const tenant = await this.tenant(context); const db = getDatabase(); const [worker] = await db.select().from(workers).where(and(eq(workers.organizationId, tenant.organizationId), eq(workers.id, workerId))).limit(1);
    if (!worker) throw new Error("WORKER_NOT_FOUND"); const versions = await this.versions(tenant.organizationId, workerId); const latest = versions.at(-1);
    let status = worker.status; let activeVersionId = worker.activeVersionId; const currentDeployment = await this.deployment(tenant.organizationId, workerId);
    if (action === "deploy" || action === "rollback") {
      const version = action === "rollback" ? versions.find((item) => item.id === versionId) : latest;
      if (!version) throw new Error("WORKER_VERSION_NOT_FOUND");
      const required = [...new Set(version.spec.capabilities.map((grant) => getCapability(grant.capability)!.integration))];
      if (required.length) {
        const activeConnections = await db.select({ provider: connections.provider }).from(connections).where(and(eq(connections.organizationId, tenant.organizationId), eq(connections.status, "CONNECTED"), inArray(connections.provider, required)));
        if (new Set(activeConnections.map((item) => item.provider)).size !== required.length) throw new Error("REQUIRED_CONNECTION_MISSING");
      }
      const deployment = await this.runtime.deployWorker({ organizationId: tenant.organizationId, workerId, workerVersionId: version.id, triggers: version.spec.triggers, existing: currentDeployment?.value });
      await db.insert(runtimeDeployments).values({ organizationId: tenant.organizationId, workerId, workerVersionId: version.id, provider: deployment.provider, externalDeploymentId: deployment.deploymentId, status: "ACTIVE", metadataJson: { scheduleIds: deployment.scheduleIds } }).onConflictDoUpdate({ target: [runtimeDeployments.organizationId, runtimeDeployments.workerId], set: { workerVersionId: version.id, provider: deployment.provider, externalDeploymentId: deployment.deploymentId, status: "ACTIVE", metadataJson: { scheduleIds: deployment.scheduleIds }, updatedAt: new Date() } });
      const triggerKeys: string[] = [];
      for (const [index, trigger] of version.spec.triggers.entries()) {
        const key = `${workerId}:${trigger.type}:${index}`; triggerKeys.push(key);
        await db.insert(workerTriggers).values({ organizationId: tenant.organizationId, workerId, workerVersionId: version.id, type: trigger.type, configJson: { ...trigger }, runtimeTriggerId: deployment.scheduleIds[key], deduplicationKey: key, enabled: true })
          .onConflictDoUpdate({ target: [workerTriggers.organizationId, workerTriggers.deduplicationKey], set: { workerVersionId: version.id, type: trigger.type, configJson: { ...trigger }, runtimeTriggerId: deployment.scheduleIds[key] ?? null, enabled: true, updatedAt: new Date() } });
      }
      await db.update(workerTriggers).set({ enabled: false, updatedAt: new Date() }).where(and(eq(workerTriggers.organizationId, tenant.organizationId), eq(workerTriggers.workerId, workerId), notInArray(workerTriggers.deduplicationKey, triggerKeys)));
      await db.update(workerVersions).set({ deployedAt: new Date() }).where(and(eq(workerVersions.organizationId, tenant.organizationId), eq(workerVersions.id, version.id)));
      status = "DEPLOYED"; activeVersionId = version.id;
    } else if (action === "pause") {
      if (worker.status !== "DEPLOYED" || !currentDeployment) throw new Error("INVALID_STATE_TRANSITION"); await this.runtime.pauseWorker({ organizationId: tenant.organizationId, workerId, deployment: currentDeployment.value }); await db.update(workerTriggers).set({ enabled: false, updatedAt: new Date() }).where(and(eq(workerTriggers.organizationId, tenant.organizationId), eq(workerTriggers.workerId, workerId))); status = "PAUSED";
    } else if (action === "resume") {
      if (worker.status !== "PAUSED" || !currentDeployment) throw new Error("INVALID_STATE_TRANSITION"); await this.runtime.resumeWorker({ organizationId: tenant.organizationId, workerId, deployment: currentDeployment.value }); await db.update(workerTriggers).set({ enabled: true, updatedAt: new Date() }).where(and(eq(workerTriggers.organizationId, tenant.organizationId), eq(workerTriggers.workerId, workerId), eq(workerTriggers.workerVersionId, worker.activeVersionId!))); status = "DEPLOYED";
    } else {
      if (currentDeployment && worker.status === "DEPLOYED") await this.runtime.pauseWorker({ organizationId: tenant.organizationId, workerId, deployment: currentDeployment.value }); await db.update(workerTriggers).set({ enabled: false, updatedAt: new Date() }).where(and(eq(workerTriggers.organizationId, tenant.organizationId), eq(workerTriggers.workerId, workerId))); status = "ARCHIVED";
    }
    const [updated] = await db.update(workers).set({ status, activeVersionId, archivedAt: status === "ARCHIVED" ? new Date() : null, updatedAt: new Date() }).where(and(eq(workers.organizationId, tenant.organizationId), eq(workers.id, workerId))).returning();
    await this.audit(context, tenant, `worker.${action}`, "worker", workerId, { versionId: activeVersionId }); return this.workerFromRow(tenant.organizationId, updated!);
  }

  private async uiRun(organizationId: string, row: typeof runs.$inferSelect): Promise<UiRun> {
    const steps = await getDatabase().select().from(runSteps).where(and(eq(runSteps.organizationId, organizationId), eq(runSteps.runId, row.id))).orderBy(asc(runSteps.sequence));
    return { id: row.id, organizationId, workerId: row.workerId, workerVersionId: row.workerVersionId, mode: row.mode, triggerType: row.triggerType, status: row.status, createdAt: row.createdAt.toISOString(), estimatedCostUsd: Number(row.estimatedCostUsd), steps: steps.map((step) => ({ sequence: step.sequence, type: step.stepType, status: step.status, summary: step.summary, at: step.createdAt.toISOString() })) };
  }

  async listRuns(context: TenantContext, workerId?: string): Promise<UiRun[]> {
    const tenant = await this.tenant(context); const where = workerId ? and(eq(runs.organizationId, tenant.organizationId), eq(runs.workerId, workerId)) : eq(runs.organizationId, tenant.organizationId); const rows = await getDatabase().select().from(runs).where(where).orderBy(desc(runs.createdAt)); return Promise.all(rows.map((run) => this.uiRun(tenant.organizationId, run)));
  }

  async getRun(context: TenantContext, runId: string): Promise<UiRun | undefined> {
    const tenant = await this.tenant(context); const [run] = await getDatabase().select().from(runs).where(and(eq(runs.organizationId, tenant.organizationId), eq(runs.id, runId))).limit(1); return run ? this.uiRun(tenant.organizationId, run) : undefined;
  }

  private async startRun(context: TenantContext, workerId: string, mode: "dry_run" | "live"): Promise<UiRun> {
    const tenant = await this.tenant(context); const db = getDatabase(); const [worker] = await db.select().from(workers).where(and(eq(workers.organizationId, tenant.organizationId), eq(workers.id, workerId))).limit(1);
    if (!worker) throw new Error("WORKER_NOT_FOUND"); const versionId = worker.activeVersionId ?? (await this.versions(tenant.organizationId, workerId)).at(-1)?.id;
    if (!versionId) throw new Error("WORKER_VERSION_NOT_FOUND"); if (mode === "live" && worker.status !== "DEPLOYED") throw new Error("WORKER_NOT_DEPLOYED");
    const correlationId = crypto.randomUUID(); const [run] = await db.insert(runs).values({ organizationId: tenant.organizationId, workerId, workerVersionId: versionId, runtimeProvider: "trigger.dev", correlationId, mode, triggerType: "manual", triggerPayload: {}, status: "QUEUED" }).returning();
    if (!run) throw new Error("RUN_CREATE_FAILED");
    const handle = await this.runtime.triggerRun({ organizationId: tenant.organizationId, workerId, workerVersionId: versionId, runId: run.id, mode, trigger: { type: "manual", payload: {} } });
    const [updated] = await db.update(runs).set({ runtimeRunId: handle.runtimeRunId, updatedAt: new Date() }).where(and(eq(runs.organizationId, tenant.organizationId), eq(runs.id, run.id))).returning();
    await this.audit(context, tenant, mode === "dry_run" ? "run.test_started" : "run.started", "run", run.id, { workerId }); return this.uiRun(tenant.organizationId, updated!);
  }

  createPreviewRun(context: TenantContext, workerId: string): Promise<UiRun> { return this.startRun(context, workerId, "dry_run"); }
  createLiveRun(context: TenantContext, workerId: string): Promise<UiRun> { return this.startRun(context, workerId, "live"); }

  async cancelRun(context: TenantContext, runId: string): Promise<UiRun> {
    const tenant = await this.tenant(context); const db = getDatabase(); const [run] = await db.select().from(runs).where(and(eq(runs.organizationId, tenant.organizationId), eq(runs.id, runId))).limit(1);
    if (!run) throw new Error("RUN_NOT_FOUND"); if (!run.runtimeRunId || !["QUEUED", "RUNNING", "WAITING_FOR_APPROVAL"].includes(run.status)) throw new Error("RUN_NOT_CANCELLABLE");
    await this.runtime.cancelRun({ organizationId: tenant.organizationId, runId, runtimeRunId: run.runtimeRunId }); const [updated] = await db.update(runs).set({ status: "CANCELLED", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(runs.organizationId, tenant.organizationId), eq(runs.id, runId))).returning(); await this.audit(context, tenant, "run.cancelled", "run", runId); return this.uiRun(tenant.organizationId, updated!);
  }

  private uiApproval(organizationId: string, row: typeof approvals.$inferSelect): UiApproval {
    return { id: row.id, organizationId, workerId: row.workerId, runId: row.runId, capabilityId: row.capabilityId, reason: row.reason, preview: row.redactedInputPreview, requestHash: row.requestHash, status: row.status, requestedAt: row.requestedAt.toISOString(), expiresAt: row.expiresAt.toISOString(), decidedAt: row.decidedAt?.toISOString(), comment: row.comment ?? undefined };
  }

  async listApprovals(context: TenantContext): Promise<UiApproval[]> { const tenant = await this.tenant(context); const rows = await getDatabase().select().from(approvals).where(eq(approvals.organizationId, tenant.organizationId)).orderBy(desc(approvals.requestedAt)); return rows.map((row) => this.uiApproval(tenant.organizationId, row)); }

  async decideApproval(context: TenantContext, approvalId: string, decision: "approve" | "reject", comment?: string): Promise<UiApproval> {
    const tenant = await this.tenant(context); const db = getDatabase(); const [approval] = await db.select().from(approvals).where(and(eq(approvals.organizationId, tenant.organizationId), eq(approvals.id, approvalId))).limit(1);
    if (!approval) throw new Error("APPROVAL_NOT_FOUND"); if (approval.status !== "PENDING") throw new Error("APPROVAL_ALREADY_DECIDED"); if (approval.expiresAt <= new Date()) { await db.update(approvals).set({ status: "EXPIRED" }).where(eq(approvals.id, approval.id)); throw new Error("APPROVAL_EXPIRED"); }
    const status = decision === "approve" ? "APPROVED" : "REJECTED"; const [updated] = await db.update(approvals).set({ status, decidedAt: new Date(), decidedBy: tenant.userId, comment }).where(and(eq(approvals.organizationId, tenant.organizationId), eq(approvals.id, approvalId))).returning();
    if (approval.waitpointId) await wait.completeToken(approval.waitpointId, { decision: decision === "approve" ? "approved" : "rejected", requestHash: approval.requestHash, comment });
    await this.audit(context, tenant, `approval.${decision}d`, "approval", approvalId, { runId: approval.runId }); return this.uiApproval(tenant.organizationId, updated!);
  }

  async listAuditEvents(context: TenantContext): Promise<UiAuditEvent[]> {
    const tenant = await this.tenant(context); const rows = await getDatabase().select().from(auditEvents).where(eq(auditEvents.organizationId, tenant.organizationId)).orderBy(desc(auditEvents.createdAt)).limit(200);
    return rows.map((row) => ({ id: row.id, organizationId: tenant.organizationId, actorType: row.actorType, actorId: row.actorId, action: row.action, targetType: row.targetType, targetId: row.targetId, metadata: row.metadataJson, createdAt: row.createdAt.toISOString() }));
  }

  async listConnections(context: TenantContext): Promise<UiConnection[]> {
    const tenant = await this.tenant(context); const rows = await getDatabase().select().from(connections).where(eq(connections.organizationId, tenant.organizationId)).orderBy(desc(connections.updatedAt));
    const latest = new Map<UiConnection["provider"], UiConnection>(); for (const row of rows) if (!latest.has(row.provider)) latest.set(row.provider, { provider: row.provider, status: row.status, displayName: row.displayName }); return [...latest.values()];
  }
}

const globalStore = globalThis as typeof globalThis & { __agentCloudPostgresStore?: PostgresControlPlaneStore };
export const postgresControlPlane = globalStore.__agentCloudPostgresStore ??= new PostgresControlPlaneStore();
