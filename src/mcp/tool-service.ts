import { getBuilderApplication } from "@/application/builder";
import type { BuilderSession } from "@/application/builder/session";
import { getControlPlane } from "@/application/control-plane";
import type { WorkerSpec } from "@/domain/worker-spec";
import type { TenantContext } from "@/lib/auth/tenant-context";
import { isDemoMode } from "@/lib/env";
import { mcpResourceLocation } from "./resource-urls";

export const mcpToolNames = [
  "start_worker_builder", "get_worker_builder", "refine_worker_builder", "commit_worker_builder", "abandon_worker_builder",
  "create_worker", "get_worker", "list_workers", "update_worker", "list_connections", "connect_tool", "test_worker", "deploy_worker", "trigger_worker", "cancel_run", "get_run", "list_runs", "pause_worker", "resume_worker", "list_approvals", "approve_action", "reject_action", "get_usage", "list_worker_versions", "rollback_worker", "delete_worker",
] as const;
export type McpToolName = (typeof mcpToolNames)[number];

export const mcpToolScopes: Record<McpToolName, string> = {
  start_worker_builder: "workers:write",
  get_worker_builder: "workers:read",
  refine_worker_builder: "workers:write",
  commit_worker_builder: "workers:write",
  abandon_worker_builder: "workers:write",
  create_worker: "workers:write",
  get_worker: "workers:read",
  list_workers: "workers:read",
  update_worker: "workers:write",
  list_connections: "connections:read",
  connect_tool: "connections:read",
  test_worker: "workers:write",
  deploy_worker: "workers:deploy",
  trigger_worker: "workers:write",
  cancel_run: "workers:write",
  get_run: "runs:read",
  list_runs: "runs:read",
  pause_worker: "workers:deploy",
  resume_worker: "workers:deploy",
  list_approvals: "approvals:read",
  approve_action: "approvals:write",
  reject_action: "approvals:write",
  get_usage: "runs:read",
  list_worker_versions: "workers:read",
  rollback_worker: "workers:deploy",
  delete_worker: "workers:write",
};

function inputString(input: Record<string, unknown>, field: string): string {
  return typeof input[field] === "string" ? input[field] : "";
}

function inputConstraints(input: Record<string, unknown>): string[] {
  return Array.isArray(input.constraints)
    ? input.constraints.filter((value): value is string => typeof value === "string")
    : [];
}

function locationFields(kind: "builder" | "worker" | "run" | "approval", id: string): Record<string, string> {
  const location = mcpResourceLocation(kind, id);
  const prefix = kind === "builder" ? "builder" : kind === "worker" ? "worker" : kind === "run" ? "run" : "approvals";
  return { [`${prefix}Path`]: location.path, ...(location.url ? { [`${prefix}Url`]: location.url } : {}) };
}

function withLocation<T extends { id: string }>(kind: "worker" | "run" | "approval", value: T): T & Record<string, string> {
  return { ...value, ...locationFields(kind, value.id) };
}

function safeBuilderView(session: BuilderSession): Record<string, unknown> {
  return {
    id: session.id,
    status: session.status,
    revision: session.revision,
    ...(session.workerId ? { workerId: session.workerId } : {}),
    ...(session.baseWorkerVersionId ? { baseWorkerVersionId: session.baseWorkerVersionId } : {}),
    ...(session.committedWorkerVersionId ? { committedWorkerVersionId: session.committedWorkerVersionId } : {}),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    proposalHistory: session.proposals.map(({ revision, proposal, createdAt }) => ({
      revision,
      summary: proposal.summary,
      specHash: proposal.specHash,
      readiness: proposal.readiness,
      diff: proposal.diff,
      createdAt,
    })),
  };
}

function builderOutput(session: BuilderSession): Record<string, unknown> {
  const latest = session.proposals.at(-1);
  return {
    session: safeBuilderView(session),
    ...(latest ? { latestProposal: latest.proposal } : {}),
    ...locationFields("builder", session.id),
  };
}

async function startBuilder(input: Record<string, unknown>, context: TenantContext) {
  const application = await getBuilderApplication(context);
  const workerId = inputString(input, "workerId");
  let startObjective = inputString(input, "objective");
  let base: Readonly<{
    workerId: string;
    baseWorkerVersionId: string;
    baseSpec: WorkerSpec;
  }> | undefined;

  if (workerId) {
    const controlPlane = await getControlPlane();
    const worker = await controlPlane.getWorker(context, workerId);
    if (!worker) throw new Error("WORKER_NOT_FOUND");
    const latest = worker.versions.at(-1);
    if (!latest) throw new Error("WORKER_VERSION_NOT_FOUND");
    base = { workerId: worker.id, baseWorkerVersionId: latest.id, baseSpec: latest.spec };
    if (!startObjective) startObjective = latest.spec.objective;
  }

  const session = await application.service.start({
    organizationId: application.organizationId,
    userId: application.userId,
    objective: startObjective,
    constraints: inputConstraints(input),
    ...base,
  });
  return { application, session };
}

async function commitLatest(
  application: Awaited<ReturnType<typeof getBuilderApplication>>,
  session: BuilderSession,
) {
  const latest = session.proposals.at(-1);
  if (!latest || latest.revision !== session.revision) throw new Error("BUILDER_PROPOSAL_NOT_FOUND");
  return application.committer.commit({
    organizationId: application.organizationId,
    sessionId: session.id,
    expectedRevision: session.revision,
    expectedSpecHash: latest.proposal.specHash,
  });
}

export async function executeMcpTool(name: McpToolName, input: Record<string, unknown>, context: TenantContext): Promise<Record<string, unknown>> {
  const workerId = inputString(input, "workerId");
  const controlPlane = await getControlPlane();
  switch (name) {
    case "start_worker_builder": {
      const { session } = await startBuilder(input, context);
      return builderOutput(session);
    }
    case "get_worker_builder": {
      const application = await getBuilderApplication(context);
      const session = await application.service.get({ organizationId: application.organizationId, sessionId: inputString(input, "sessionId") });
      if (!session) throw new Error("BUILDER_SESSION_NOT_FOUND");
      return builderOutput(session);
    }
    case "refine_worker_builder": {
      const application = await getBuilderApplication(context);
      const session = await application.service.refine({
        organizationId: application.organizationId,
        sessionId: inputString(input, "sessionId"),
        expectedRevision: Number(input.expectedRevision),
        message: inputString(input, "message"),
      });
      return builderOutput(session);
    }
    case "commit_worker_builder": {
      const application = await getBuilderApplication(context);
      const result = await application.committer.commit({
        organizationId: application.organizationId,
        sessionId: inputString(input, "sessionId"),
        expectedRevision: Number(input.expectedRevision),
        expectedSpecHash: inputString(input, "expectedSpecHash"),
      });
      const worker = await controlPlane.getWorker(context, result.workerId);
      if (!worker) throw new Error("WORKER_NOT_FOUND");
      const { session, ...commit } = result;
      return { ...builderOutput(session), ...commit, worker: withLocation("worker", worker), ...locationFields("worker", worker.id) };
    }
    case "abandon_worker_builder": {
      const application = await getBuilderApplication(context);
      const session = await application.service.abandon({
        organizationId: application.organizationId,
        sessionId: inputString(input, "sessionId"),
        expectedRevision: Number(input.expectedRevision),
      });
      return builderOutput(session);
    }
    case "create_worker": {
      const { application, session } = await startBuilder(input, context);
      const committed = await commitLatest(application, session);
      const worker = await controlPlane.getWorker(context, committed.workerId);
      if (!worker) throw new Error("WORKER_NOT_FOUND");
      const proposal = session.proposals.at(-1)!.proposal;
      return {
        workerId: worker.id,
        status: worker.status,
        worker: withLocation("worker", worker),
        requiredConnections: proposal.requiredConnections,
        missingConnections: proposal.missingConnections,
        ...locationFields("worker", worker.id),
        ...builderOutput(committed.session),
      };
    }
    case "get_worker": {
      const worker = await controlPlane.getWorker(context, workerId);
      if (!worker) throw new Error("WORKER_NOT_FOUND");
      return { worker: withLocation("worker", worker), ...locationFields("worker", worker.id) };
    }
    case "list_workers": {
      const workers = await controlPlane.listWorkers(context);
      return { workers: workers.map((worker) => withLocation("worker", worker)) };
    }
    case "test_worker": {
      const run = await controlPlane.createPreviewRun(context, workerId);
      return { runId: run.id, status: run.status, mode: run.mode, run: withLocation("run", run), ...locationFields("run", run.id) };
    }
    case "deploy_worker": {
      const worker = await controlPlane.transition(context, workerId, "deploy");
      return { worker: withLocation("worker", worker), ...locationFields("worker", worker.id) };
    }
    case "pause_worker": {
      const worker = await controlPlane.transition(context, workerId, "pause");
      return { worker: withLocation("worker", worker), ...locationFields("worker", worker.id) };
    }
    case "resume_worker": {
      const worker = await controlPlane.transition(context, workerId, "resume");
      return { worker: withLocation("worker", worker), ...locationFields("worker", worker.id) };
    }
    case "delete_worker": {
      const worker = await controlPlane.transition(context, workerId, "archive");
      return { worker: withLocation("worker", worker), archived: true, ...locationFields("worker", worker.id) };
    }
    case "get_run": {
      const run = await controlPlane.getRun(context, inputString(input, "runId"));
      if (!run) throw new Error("RUN_NOT_FOUND");
      return { run: withLocation("run", run), ...locationFields("run", run.id) };
    }
    case "list_runs": {
      const runs = await controlPlane.listRuns(context, workerId || undefined);
      return { runs: runs.map((run) => withLocation("run", run)) };
    }
    case "list_approvals": {
      const approvals = await controlPlane.listApprovals(context);
      return { approvals: approvals.map((approval) => withLocation("approval", approval)), ...locationFields("approval", "list") };
    }
    case "approve_action": {
      const approval = await controlPlane.decideApproval(context, inputString(input, "approvalId"), "approve", typeof input.comment === "string" ? input.comment : undefined);
      return { approval: withLocation("approval", approval), ...locationFields("approval", approval.id), ...locationFields("run", approval.runId) };
    }
    case "reject_action": {
      const approval = await controlPlane.decideApproval(context, inputString(input, "approvalId"), "reject", typeof input.comment === "string" ? input.comment : undefined);
      return { approval: withLocation("approval", approval), ...locationFields("approval", approval.id), ...locationFields("run", approval.runId) };
    }
    case "list_worker_versions": {
      const worker = await controlPlane.getWorker(context, workerId);
      if (!worker) throw new Error("WORKER_NOT_FOUND");
      return { versions: worker.versions.map(({ spec, ...version }) => ({ ...version, summary: spec.identity.description })), ...locationFields("worker", worker.id) };
    }
    case "rollback_worker": {
      const worker = await controlPlane.transition(context, workerId, "rollback", inputString(input, "versionId"));
      return { worker: withLocation("worker", worker), ...locationFields("worker", worker.id) };
    }
    case "list_connections": return { connections: await controlPlane.listConnections(context) };
    case "connect_tool": {
      const provider = input.provider as "gmail" | "hubspot" | "slack";
      if (isDemoMode()) return { provider, status: "CONNECTED", displayName: `Demo ${provider}`, note: "Demo mode uses deterministic adapters; no OAuth secret is returned." };
      const { beginConnection } = await import("@/integrations/connection-service");
      const link = await beginConnection({ context, provider, origin: process.env.APP_BASE_URL ?? "" });
      return { provider, status: "PENDING", connectionRequestId: link.connectionRequestId, redirectUrl: link.redirectUrl };
    }
    case "trigger_worker": {
      const run = await controlPlane.createLiveRun(context, workerId);
      return {
        runId: run.id,
        status: run.status,
        run: withLocation("run", run),
        ...locationFields("run", run.id),
        ...(run.status === "WAITING_FOR_APPROVAL" ? locationFields("approval", "list") : {}),
      };
    }
    case "update_worker": {
      const { application, session } = await startBuilder(input, context);
      const committed = await commitLatest(application, session);
      const worker = await controlPlane.getWorker(context, committed.workerId);
      if (!worker) throw new Error("WORKER_NOT_FOUND");
      return { worker: withLocation("worker", worker), ...locationFields("worker", worker.id), ...builderOutput(committed.session) };
    }
    case "cancel_run": {
      const run = await controlPlane.cancelRun(context, inputString(input, "runId"));
      return { run: withLocation("run", run), ...locationFields("run", run.id) };
    }
    case "get_usage": {
      const runs = await controlPlane.listRuns(context, workerId || undefined);
      return { usage: { runs: runs.length, estimatedCostUsd: runs.reduce((sum, run) => sum + run.estimatedCostUsd, 0) } };
    }
  }
}
