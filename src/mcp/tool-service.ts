import { demoControlPlane } from "@/application/control-plane/demo-store";
import type { TenantContext } from "@/lib/auth/tenant-context";

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
  switch (name) {
    case "create_worker": { const worker = await demoControlPlane.createWorker(context, String(input.objective ?? "")); return { workerId: worker.id, status: worker.status, worker, requiredConnections: ["gmail", "hubspot", "slack"], missingConnections: [] }; }
    case "get_worker": { const worker = demoControlPlane.getWorker(context, workerId); if (!worker) throw new Error("WORKER_NOT_FOUND"); return { worker }; }
    case "list_workers": return { workers: demoControlPlane.listWorkers(context) };
    case "test_worker": { const run = await demoControlPlane.createPreviewRun(context, workerId); return { runId: run.id, status: run.status, mode: run.mode }; }
    case "deploy_worker": return { worker: demoControlPlane.transition(context, workerId, "deploy") };
    case "pause_worker": return { worker: demoControlPlane.transition(context, workerId, "pause") };
    case "resume_worker": return { worker: demoControlPlane.transition(context, workerId, "resume") };
    case "delete_worker": return { worker: demoControlPlane.transition(context, workerId, "archive"), archived: true };
    case "get_run": { const run = demoControlPlane.getRun(context, String(input.runId ?? "")); if (!run) throw new Error("RUN_NOT_FOUND"); return { run }; }
    case "list_runs": return { runs: demoControlPlane.listRuns(context, workerId || undefined) };
    case "list_approvals": return { approvals: demoControlPlane.listApprovals(context) };
    case "approve_action": return { approval: await demoControlPlane.decideApproval(context, String(input.approvalId ?? ""), "approve", typeof input.comment === "string" ? input.comment : undefined) };
    case "reject_action": return { approval: await demoControlPlane.decideApproval(context, String(input.approvalId ?? ""), "reject", typeof input.comment === "string" ? input.comment : undefined) };
    case "list_worker_versions": { const worker = demoControlPlane.getWorker(context, workerId); if (!worker) throw new Error("WORKER_NOT_FOUND"); return { versions: worker.versions.map(({ spec, ...version }) => ({ ...version, summary: spec.identity.description })) }; }
    case "rollback_worker": return { worker: demoControlPlane.transition(context, workerId, "rollback", String(input.versionId ?? "")) };
    case "list_connections": return { connections: ["gmail", "hubspot", "slack"].map((provider) => ({ provider, status: "CONNECTED", displayName: `Demo ${provider}` })) };
    case "connect_tool": return { provider: input.provider, status: "CONNECTED", displayName: `Demo ${input.provider}`, note: "Demo mode uses deterministic adapters; no OAuth secret is returned." };
    case "trigger_worker": { const run = await demoControlPlane.createLiveRun(context, workerId); return { runId: run.id, status: run.status }; }
    case "update_worker": return { worker: await demoControlPlane.createWorkerVersion(context, workerId, String(input.objective ?? "")) };
    case "cancel_run": return { run: demoControlPlane.cancelRun(context, String(input.runId ?? "")) };
    case "get_usage": {
      const runs = demoControlPlane.listRuns(context, workerId || undefined);
      return { usage: { runs: runs.length, estimatedCostUsd: runs.reduce((sum, run) => sum + run.estimatedCostUsd, 0) } };
    }
  }
}
