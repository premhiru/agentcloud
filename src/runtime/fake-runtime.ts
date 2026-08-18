import { randomUUID } from "node:crypto";

import type { RunWorkerPayload, RuntimeDeployment, RuntimeRunHandle, WorkerRuntime } from "./types";

export class FakeWorkerRuntime implements WorkerRuntime {
  readonly triggered: RunWorkerPayload[] = [];
  readonly cancelled = new Set<string>();
  readonly pausedWorkers = new Set<string>();

  async deployWorker(input: Parameters<WorkerRuntime["deployWorker"]>[0]): Promise<RuntimeDeployment> {
    const scheduleIds = { ...(input.existing?.scheduleIds ?? {}) };
    const expected = new Set<string>();
    input.triggers.forEach((trigger, index) => {
      if (trigger.type !== "schedule") return;
      const key = `${input.workerId}:schedule:${index}`; expected.add(key);
      scheduleIds[key] ??= `fake_schedule_${randomUUID()}`;
    });
    for (const key of Object.keys(scheduleIds)) if (!expected.has(key)) delete scheduleIds[key];
    this.pausedWorkers.delete(input.workerId);
    return { provider: "fake", deploymentId: input.existing?.deploymentId ?? `fake_deployment_${randomUUID()}`, scheduleIds };
  }

  async pauseWorker(input: Parameters<WorkerRuntime["pauseWorker"]>[0]): Promise<void> { this.pausedWorkers.add(input.workerId); }
  async resumeWorker(input: Parameters<WorkerRuntime["resumeWorker"]>[0]): Promise<void> { this.pausedWorkers.delete(input.workerId); }

  async triggerRun(payload: RunWorkerPayload): Promise<RuntimeRunHandle> {
    if (this.pausedWorkers.has(payload.workerId)) throw new Error("WORKER_PAUSED");
    this.triggered.push(structuredClone(payload));
    return { runtimeRunId: `fake_run_${payload.runId}`, status: "QUEUED" };
  }

  async cancelRun(input: Parameters<WorkerRuntime["cancelRun"]>[0]): Promise<void> { this.cancelled.add(input.runtimeRunId); }
}
