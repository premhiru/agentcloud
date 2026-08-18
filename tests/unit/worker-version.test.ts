import { describe, expect, it } from "vitest";

import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";
import { appendWorkerVersion, createWorkerVersion, deployVersion, pauseWorker, resumeWorker, rollbackWorker, type WorkerAggregate } from "@/domain/worker-version";

describe("worker versioning and lifecycle", () => {
  const v1 = createWorkerVersion({ id: "v1", versionNumber: 1, spec: inboundSalesWorkerSpec(), createdAt: new Date(0) });
  const base: WorkerAggregate = { id: "w1", status: "READY", versions: [v1] };

  it("hashes immutable version contents", () => {
    expect(v1.specHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(v1)).toBe(true);
    expect(Object.isFrozen(v1.spec.authority.rules)).toBe(true);
  });

  it("deploys, pauses, and resumes", () => {
    const deployed = deployVersion(base, "v1");
    expect(resumeWorker(pauseWorker(deployed)).status).toBe("DEPLOYED");
  });

  it("appends only the next version", () => {
    const v2 = createWorkerVersion({ id: "v2", versionNumber: 2, spec: { ...inboundSalesWorkerSpec(), objective: "A materially edited objective" } });
    expect(appendWorkerVersion(base, v2).versions).toHaveLength(2);
    expect(() => appendWorkerVersion(base, { ...v2, versionNumber: 3 })).toThrow("Expected worker version 2");
  });

  it("rolls back by selecting an immutable historical version", () => {
    const v2 = createWorkerVersion({ id: "v2", versionNumber: 2, spec: { ...inboundSalesWorkerSpec(), objective: "A materially edited objective" } });
    const worker = deployVersion(appendWorkerVersion(base, v2), "v2");
    expect(rollbackWorker(worker, "v1").activeVersionId).toBe("v1");
  });
});
