import { getControlPlane } from "@/application/control-plane";
import { getCapability } from "@/domain/tool-registry";
import type { TenantContext } from "@/lib/auth/tenant-context";
import { isDemoMode } from "@/lib/env";

export const mcpToolNames = ["create_worker", "get_worker", "list_workers", "update_worker", "list_connections", "connect_tool", "test_worker", "deploy_worker", "trigger_worker", "cancel_run", "get_run", "list_runs", "pause_worker", "resume_worker", "list_approvals", "approve_action", "reject_action", "get_usage", "list_worker_versions", "rollback_worker", "delete_worker"] as const;
export type McpToolName = (typeof mcpToolNames)[number];

export const mcpToolScopes: Record<McpToolName, string> = {
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

export async function executeMcpTool(name: McpToolName, input: Record<string, unknown>, context: TenantContext): Promise<Record<string, unknown>> {
  const workerId = typeof input.workerId === "string" ? input.workerId : "";
  const controlPlane = await getControlPlane();
  switch (name) {
    case "create_worker": {
      const worker = await controlPlane.createWorker(context, String(input.objective ?? ""));
      const active = worker.versions.find((version) => version.id === worker.activeVersionId) ?? worker.versions.at(-1)!;
      const requiredConnections = [...new Set(active.spec.capabilities.map((grant) => getCapability(grant.capability)?.integration).filter((provider): provider is "gmail" | "hubspot" | "slack" => Boolean(provider)))];
      const connected = new Set((await controlPlane.listConnections(context)).filter((connection) => connection.status === "CONNECTED").map((connection) => connection.provider));
      return { workerId: worker.id, status: worker.status, worker, requiredConnections, missingConnections: requiredConnections.filter((provider) => !connected.has(provider)) };
    }
    case "get_worker": { const worker = await controlPlane.getWorker(context, workerId); if (!worker) throw new Error("WORKER_NOT_FOUND"); return { worker }; }
    case "list_workers": return { workers: await controlPlane.listWorkers(context) };
    case "test_worker": { const run = await controlPlane.createPreviewRun(context, workerId); return { runId: run.id, status: run.status, mode: run.mode }; }
    case "deploy_worker": return { worker: await controlPlane.transition(context, workerId, "deploy") };
    case "pause_worker": return { worker: await controlPlane.transition(context, workerId, "pause") };
    case "resume_worker": return { worker: await controlPlane.transition(context, workerId, "resume") };
    case "delete_worker": return { worker: await controlPlane.transition(context, workerId, "archive"), archived: true };
    case "get_run": { const run = await controlPlane.getRun(context, String(input.runId ?? "")); if (!run) throw new Error("RUN_NOT_FOUND"); return { run }; }
    case "list_runs": return { runs: await controlPlane.listRuns(context, workerId || undefined) };
    case "list_approvals": return { approvals: await controlPlane.listApprovals(context) };
    case "approve_action": return { approval: await controlPlane.decideApproval(context, String(input.approvalId ?? ""), "approve", typeof input.comment === "string" ? input.comment : undefined) };
    case "reject_action": return { approval: await controlPlane.decideApproval(context, String(input.approvalId ?? ""), "reject", typeof input.comment === "string" ? input.comment : undefined) };
    case "list_worker_versions": { const worker = await controlPlane.getWorker(context, workerId); if (!worker) throw new Error("WORKER_NOT_FOUND"); return { versions: worker.versions.map(({ spec, ...version }) => ({ ...version, summary: spec.identity.description })) }; }
    case "rollback_worker": return { worker: await controlPlane.transition(context, workerId, "rollback", String(input.versionId ?? "")) };
    case "list_connections": return { connections: await controlPlane.listConnections(context) };
    case "connect_tool": {
      const provider = input.provider as "gmail" | "hubspot" | "slack";
      if (isDemoMode()) return { provider, status: "CONNECTED", displayName: `Demo ${provider}`, note: "Demo mode uses deterministic adapters; no OAuth secret is returned." };
      const { beginConnection } = await import("@/integrations/connection-service"); const link = await beginConnection({ context, provider, origin: process.env.APP_BASE_URL ?? "" }); return { provider, status: "PENDING", connectionRequestId: link.connectionRequestId, redirectUrl: link.redirectUrl };
    }
    case "trigger_worker": { const run = await controlPlane.createLiveRun(context, workerId); return { runId: run.id, status: run.status }; }
    case "update_worker": return { worker: await controlPlane.createWorkerVersion(context, workerId, String(input.objective ?? "")) };
    case "cancel_run": return { run: await controlPlane.cancelRun(context, String(input.runId ?? "")) };
    case "get_usage": {
      const runs = await controlPlane.listRuns(context, workerId || undefined);
      return { usage: { runs: runs.length, estimatedCostUsd: runs.reduce((sum, run) => sum + run.estimatedCostUsd, 0) } };
    }
  }
}
