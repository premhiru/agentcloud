import { schedules } from "@trigger.dev/sdk";

export const runWorkerScheduledTask = schedules.task({
  id: "run-worker-scheduled",
  retry: { maxAttempts: 1 },
  run: async (payload) => {
    const [{ and, eq }, { getDatabase }, schema, { executeWorkerTask }] = await Promise.all([import("drizzle-orm"), import("../src/db/client"), import("../src/db/schema"), import("../src/runtime/worker-task-handler")]);
    const db = getDatabase();
    const [trigger] = await db.select().from(schema.workerTriggers).where(and(eq(schema.workerTriggers.runtimeTriggerId, payload.scheduleId), eq(schema.workerTriggers.type, "schedule"), eq(schema.workerTriggers.enabled, true))).limit(1);
    if (!trigger) throw new Error("SCHEDULE_TRIGGER_NOT_ACTIVE");
    const [worker] = await db.select().from(schema.workers).where(and(eq(schema.workers.organizationId, trigger.organizationId), eq(schema.workers.id, trigger.workerId))).limit(1);
    if (!worker || worker.status !== "DEPLOYED" || worker.activeVersionId !== trigger.workerVersionId) throw new Error("WORKER_NOT_DEPLOYED");
    const correlationId = `schedule:${payload.scheduleId}:${payload.timestamp.toISOString()}`;
    const [existing] = await db.select().from(schema.runs).where(eq(schema.runs.correlationId, correlationId)).limit(1);
    if (existing) return { runId: existing.id, status: existing.status, duplicate: true };
    const [run] = await db.insert(schema.runs).values({ organizationId: trigger.organizationId, workerId: trigger.workerId, workerVersionId: trigger.workerVersionId, runtimeProvider: "trigger.dev", runtimeRunId: correlationId, correlationId, mode: "live", triggerType: "schedule", triggerPayload: { scheduleId: payload.scheduleId, scheduledAt: payload.timestamp.toISOString() }, status: "QUEUED" }).returning();
    if (!run) throw new Error("RUN_CREATE_FAILED");
    const result = await executeWorkerTask({ organizationId: trigger.organizationId, workerId: trigger.workerId, workerVersionId: trigger.workerVersionId, runId: run.id, mode: "live", trigger: { type: "schedule", payload: { scheduleId: payload.scheduleId, scheduledAt: payload.timestamp.toISOString() } } });
    return { ...result, duplicate: false };
  },
});
