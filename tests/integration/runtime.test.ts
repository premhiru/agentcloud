import { describe, expect, it } from "vitest";

import { FakeWorkerRuntime } from "@/runtime/fake-runtime";

const deploymentInput = { organizationId: "org_1", workerId: "worker_1", workerVersionId: "version_1", triggers: [{ type: "manual" as const }, { type: "schedule" as const, cron: "0 8 * * *", timezone: "Asia/Singapore" }] };
const payload = { organizationId: "org_1", workerId: "worker_1", workerVersionId: "version_1", runId: "run_1", mode: "live" as const, trigger: { type: "manual" as const, payload: {} } };

describe("WorkerRuntime contract", () => {
  it("deploys and updates schedules without duplicates", async () => {
    const runtime = new FakeWorkerRuntime();
    const first = await runtime.deployWorker(deploymentInput);
    const second = await runtime.deployWorker({ ...deploymentInput, existing: first });
    expect(Object.values(second.scheduleIds)).toEqual(Object.values(first.scheduleIds));
  });

  it("prevents new runs while paused and resumes", async () => {
    const runtime = new FakeWorkerRuntime(); const deployment = await runtime.deployWorker(deploymentInput);
    await runtime.pauseWorker({ organizationId: "org_1", workerId: "worker_1", deployment });
    await expect(runtime.triggerRun(payload)).rejects.toThrow("WORKER_PAUSED");
    await runtime.resumeWorker({ organizationId: "org_1", workerId: "worker_1", deployment });
    await expect(runtime.triggerRun(payload)).resolves.toMatchObject({ status: "QUEUED" });
  });

  it("records cancellation", async () => {
    const runtime = new FakeWorkerRuntime();
    await runtime.cancelRun({ organizationId: "org_1", runId: "run_1", runtimeRunId: "runtime_1" });
    expect(runtime.cancelled.has("runtime_1")).toBe(true);
  });
});
