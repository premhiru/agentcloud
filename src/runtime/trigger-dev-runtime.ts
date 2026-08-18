import "server-only";

import { runs, schedules, tasks } from "@trigger.dev/sdk";

import type { RunWorkerPayload, RuntimeDeployment, RuntimeRunHandle, WorkerRuntime } from "./types";

export class TriggerDevRuntime implements WorkerRuntime {
  async deployWorker(input: Parameters<WorkerRuntime["deployWorker"]>[0]): Promise<RuntimeDeployment> {
    const scheduleIds = { ...(input.existing?.scheduleIds ?? {}) };
    const expected = new Set<string>();
    for (const [index, trigger] of input.triggers.entries()) {
      if (trigger.type !== "schedule") continue;
      const key = `${input.workerId}:schedule:${index}`; expected.add(key);
      const options = { task: "run-worker-scheduled", cron: trigger.cron, timezone: trigger.timezone, externalId: key, deduplicationKey: key };
      const currentId = scheduleIds[key];
      const schedule = currentId ? await schedules.update(currentId, options) : await schedules.create(options);
      scheduleIds[key] = schedule.id;
    }
    for (const [key, scheduleId] of Object.entries(scheduleIds)) {
      if (!expected.has(key)) { await schedules.del(scheduleId); delete scheduleIds[key]; }
    }
    return { provider: "trigger.dev", deploymentId: input.existing?.deploymentId ?? `worker:${input.workerId}`, scheduleIds };
  }

  async pauseWorker(input: Parameters<WorkerRuntime["pauseWorker"]>[0]): Promise<void> {
    await Promise.all(Object.values(input.deployment.scheduleIds).map((id) => schedules.deactivate(id)));
  }
  async resumeWorker(input: Parameters<WorkerRuntime["resumeWorker"]>[0]): Promise<void> {
    await Promise.all(Object.values(input.deployment.scheduleIds).map((id) => schedules.activate(id)));
  }
  async triggerRun(payload: RunWorkerPayload): Promise<RuntimeRunHandle> {
    const handle = await tasks.trigger<typeof import("../../trigger/run-worker").runWorkerTask>("run-worker", payload, { idempotencyKey: `agentcloud-run:${payload.runId}` });
    return { runtimeRunId: handle.id, status: "QUEUED" };
  }
  async cancelRun(input: Parameters<WorkerRuntime["cancelRun"]>[0]): Promise<void> { await runs.cancel(input.runtimeRunId); }
}
