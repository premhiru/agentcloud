import { demoControlPlane, type UiRun } from "@/application/control-plane/demo-store";
import { FakeIntegrationAdapter } from "@/integrations/fake-integration-adapter";
import type { TenantContext } from "@/lib/auth/tenant-context";
import { FakeInboundSalesModel } from "./fake-worker-model";
import { MemoryToolExecutionRepository } from "./tool-executor";
import type { RunWorkerPayload } from "./types";
import { MemoryRunnerJournal, runWorker } from "./worker-runner";

export async function executeWorkerTask(payload: RunWorkerPayload) {
  const context: TenantContext = { organizationExternalId: payload.organizationId, userExternalId: "runtime", role: "owner", source: "mcp" };
  const worker = demoControlPlane.getWorker(context, payload.workerId);
  if (!worker) throw new Error("WORKER_NOT_FOUND");
  if (worker.status === "PAUSED" || worker.status === "ARCHIVED") throw new Error("WORKER_PAUSED");
  const version = worker.versions.find((item) => item.id === payload.workerVersionId);
  if (!version) throw new Error("WORKER_VERSION_NOT_FOUND");
  const journal = new MemoryRunnerJournal();
  const result = await runWorker({ payload, spec: version.spec, model: new FakeInboundSalesModel(), integrations: new FakeIntegrationAdapter(), executions: new MemoryToolExecutionRepository(), journal });
  const now = new Date().toISOString();
  const run: UiRun = { id: payload.runId, organizationId: payload.organizationId, workerId: payload.workerId, workerVersionId: payload.workerVersionId, mode: payload.mode, triggerType: payload.trigger.type, status: result.status, createdAt: now, estimatedCostUsd: 0.0042, steps: (journal.steps.get(payload.runId) ?? []).map((step) => ({ sequence: step.sequence, type: step.type, status: step.status, summary: step.summary, at: now })) };
  demoControlPlane.recordRun(context, run);
  return { runId: payload.runId, status: result.status, workerVersionId: payload.workerVersionId };
}
