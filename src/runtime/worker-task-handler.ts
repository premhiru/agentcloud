import { isDemoMode } from "@/lib/env";
import type { RunWorkerPayload } from "./types";

async function executeDemoWorkerTask(payload: RunWorkerPayload) {
  const [{ demoControlPlane }, { FakeIntegrationAdapter }, { FakeInboundSalesModel }, { MemoryToolExecutionRepository }, { MemoryRunnerJournal, runWorker }] = await Promise.all([
    import("@/application/control-plane/demo-store"), import("@/integrations/fake-integration-adapter"), import("./fake-worker-model"), import("./tool-executor"), import("./worker-runner"),
  ]);
  const context = { organizationExternalId: payload.organizationId, userExternalId: "runtime", role: "owner" as const, source: "mcp" as const };
  const worker = demoControlPlane.getWorker(context, payload.workerId); if (!worker) throw new Error("WORKER_NOT_FOUND");
  if (worker.status === "PAUSED" || worker.status === "ARCHIVED") throw new Error("WORKER_PAUSED");
  const version = worker.versions.find((item) => item.id === payload.workerVersionId); if (!version) throw new Error("WORKER_VERSION_NOT_FOUND");
  const journal = new MemoryRunnerJournal(); const result = await runWorker({ payload, spec: version.spec, model: new FakeInboundSalesModel(), integrations: new FakeIntegrationAdapter(), executions: new MemoryToolExecutionRepository(), journal });
  const now = new Date().toISOString();
  demoControlPlane.recordRun(context, { id: payload.runId, organizationId: payload.organizationId, workerId: payload.workerId, workerVersionId: payload.workerVersionId, mode: payload.mode, triggerType: payload.trigger.type, status: result.status, createdAt: now, estimatedCostUsd: 0.0042, steps: (journal.steps.get(payload.runId) ?? []).map((step) => ({ sequence: step.sequence, type: step.type, status: step.status, summary: step.summary, at: now })) });
  return { runId: payload.runId, status: result.status, workerVersionId: payload.workerVersionId };
}

async function executeProductionWorkerTask(payload: RunWorkerPayload) {
  const [{ and, eq, count, gte, sql }, { wait }, { ApprovalEngine }, { TriggerApprovalWaitpoints }, { getDatabase }, schema, { parseWorkerSpec }, { ComposioIntegrationAdapter, createComposioGateway }, { OpenAIWorkerModel }, adapters, runner] = await Promise.all([
    import("drizzle-orm"), import("@trigger.dev/sdk"), import("@/approvals/approval-engine"), import("@/approvals/trigger-waitpoints"), import("@/db/client"), import("@/db/schema"), import("@/domain/worker-spec"), import("@/integrations/composio-adapter"), import("@/models/openai-adapters"), import("@/persistence/postgres-runtime-adapters"), import("./worker-runner"),
  ]);
  const db = getDatabase();
  const [run] = await db.select().from(schema.runs).where(and(eq(schema.runs.organizationId, payload.organizationId), eq(schema.runs.id, payload.runId), eq(schema.runs.workerId, payload.workerId), eq(schema.runs.workerVersionId, payload.workerVersionId))).limit(1);
  if (!run) throw new Error("RUN_NOT_FOUND");
  const [worker] = await db.select().from(schema.workers).where(and(eq(schema.workers.organizationId, payload.organizationId), eq(schema.workers.id, payload.workerId))).limit(1);
  if (!worker || worker.status === "PAUSED" || worker.status === "ARCHIVED") throw new Error("WORKER_PAUSED");
  const [version] = await db.select().from(schema.workerVersions).where(and(eq(schema.workerVersions.organizationId, payload.organizationId), eq(schema.workerVersions.id, payload.workerVersionId), eq(schema.workerVersions.workerId, payload.workerId))).limit(1);
  if (!version) throw new Error("WORKER_VERSION_NOT_FOUND");
  const spec = parseWorkerSpec(version.specJson); const journal = new adapters.PostgresRunnerJournal(payload.organizationId); const executions = new adapters.PostgresToolExecutionRepository(payload.organizationId, payload.runId);
  const integrations = new ComposioIntegrationAdapter(new adapters.PostgresConnectionReferenceRepository(payload.organizationId), createComposioGateway());
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const [monthly] = await db.select({ cost: sql<string>`coalesce(sum(${schema.usageEvents.estimatedCostUsd}), 0)` }).from(schema.usageEvents).where(and(eq(schema.usageEvents.organizationId, payload.organizationId), eq(schema.usageEvents.workerId, payload.workerId), gte(schema.usageEvents.createdAt, monthStart)));
  const result = await runner.runWorker({ payload, spec, model: new OpenAIWorkerModel(), integrations, executions, journal, initialUsage: { monthlyCostUsd: Number(monthly?.cost ?? 0), runCostUsd: 0, modelCalls: 0, toolCalls: 0 } });
  let finalStatus = result.status;
  if (result.status === "WAITING_FOR_APPROVAL" && result.checkpoint) {
    const call = result.checkpoint.pendingApproval;
    const approvalEngine = new ApprovalEngine(new adapters.PostgresApprovalRepository(payload.organizationId), new TriggerApprovalWaitpoints(), new adapters.PostgresApprovalNotifier(payload.organizationId));
    const approval = await approvalEngine.request({ organizationId: payload.organizationId, workerId: payload.workerId, workerVersionId: payload.workerVersionId, runId: payload.runId, modelToolCallId: call.id, capabilityId: call.capabilityId, toolInput: call.input, reason: "Worker authority requires a human decision" });
    const decision = await wait.forToken<{ decision: "approved" | "rejected"; requestHash: string }>({ id: approval.waitpointId }).unwrap();
    if (decision.decision === "rejected" || decision.requestHash !== approval.requestHash) {
      finalStatus = "CANCELLED"; await journal.setStatus(payload.runId, finalStatus);
    } else {
      const approved = await approvalEngine.executeApproved({ organizationId: payload.organizationId, approvalId: approval.id, exactToolInput: call.input, adapter: integrations, executions });
      if (approved.status !== "SUCCEEDED") { finalStatus = approved.status === "OUTCOME_UNKNOWN" ? "OUTCOME_UNKNOWN" : "FAILED"; await journal.setStatus(payload.runId, finalStatus); }
      else {
        await db.update(schema.runSteps).set({ status: "APPROVED", summary: "Human approved the exact action request" }).where(and(eq(schema.runSteps.organizationId, payload.organizationId), eq(schema.runSteps.runId, payload.runId), eq(schema.runSteps.sequence, result.checkpoint.nextSequence - 1)));
        await journal.append(payload.runId, { sequence: result.checkpoint.nextSequence, type: "tool", status: "SUCCEEDED", summary: call.summary });
        const resumed = await runner.resumeWorkerFromCheckpoint({ payload, spec, checkpoint: { ...result.checkpoint, nextSequence: result.checkpoint.nextSequence + 1 }, integrations, executions, journal }); finalStatus = resumed.status;
      }
    }
  }
  const [toolCount] = await db.select({ value: count() }).from(schema.toolExecutions).where(and(eq(schema.toolExecutions.organizationId, payload.organizationId), eq(schema.toolExecutions.runId, payload.runId)));
  const modelCalls = 1; const toolCalls = toolCount?.value ?? 0; const estimatedCostUsd = 0.003 + Number(toolCalls) * 0.0001;
  await db.insert(schema.usageEvents).values({ organizationId: payload.organizationId, workerId: payload.workerId, runId: payload.runId, modelCalls, toolCalls: Number(toolCalls), estimatedCostUsd: estimatedCostUsd.toFixed(6) });
  await db.update(schema.runs).set({ status: finalStatus as typeof schema.runs.$inferInsert.status, estimatedCostUsd: estimatedCostUsd.toFixed(6), completedAt: ["SUCCEEDED", "FAILED", "CANCELLED", "BUDGET_EXCEEDED", "OUTCOME_UNKNOWN"].includes(finalStatus) ? new Date() : undefined, updatedAt: new Date() }).where(and(eq(schema.runs.organizationId, payload.organizationId), eq(schema.runs.id, payload.runId)));
  return { runId: payload.runId, status: finalStatus, workerVersionId: payload.workerVersionId };
}

export async function executeWorkerTask(payload: RunWorkerPayload) {
  if (isDemoMode()) return executeDemoWorkerTask(payload);
  try { return await executeProductionWorkerTask(payload); }
  catch (error) {
    const [{ and, eq }, { getDatabase }, schema] = await Promise.all([import("drizzle-orm"), import("@/db/client"), import("@/db/schema")]);
    const db = getDatabase();
    await db.update(schema.runs).set({ status: "FAILED", errorCode: "RUNTIME_EXECUTION_FAILED", errorMessage: "The worker task failed before it could conclude safely", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(schema.runs.organizationId, payload.organizationId), eq(schema.runs.id, payload.runId)));
    await db.insert(schema.auditEvents).values({ organizationId: payload.organizationId, actorType: "worker", actorId: payload.workerId, action: "run.failed", targetType: "run", targetId: payload.runId, metadataJson: { code: "RUNTIME_EXECUTION_FAILED" } });
    throw error;
  }
}
