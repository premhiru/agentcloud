import { hashWorkerSpec } from "./canonical-json";
import { AgentCloudError } from "./errors";
import { parseWorkerSpec, type WorkerSpec } from "./worker-spec";

export type WorkerStatus = "DRAFT" | "READY" | "DEPLOYED" | "PAUSED" | "ARCHIVED";
export type WorkerVersion = Readonly<{ id: string; versionNumber: number; spec: WorkerSpec; specHash: string; createdAt: Date; deployedAt?: Date }>;
export type WorkerAggregate = Readonly<{ id: string; status: WorkerStatus; activeVersionId?: string; versions: readonly WorkerVersion[] }>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function createWorkerVersion(input: { id: string; versionNumber: number; spec: unknown; createdAt?: Date }): WorkerVersion {
  const spec = deepFreeze(parseWorkerSpec(input.spec));
  return deepFreeze({ id: input.id, versionNumber: input.versionNumber, spec, specHash: hashWorkerSpec(spec), createdAt: input.createdAt ?? new Date() });
}

export function appendWorkerVersion(worker: WorkerAggregate, version: WorkerVersion): WorkerAggregate {
  if (worker.status === "ARCHIVED") throw new AgentCloudError("INVALID_STATE_TRANSITION", "Archived workers cannot be edited");
  const expected = (worker.versions.at(-1)?.versionNumber ?? 0) + 1;
  if (version.versionNumber !== expected) throw new AgentCloudError("CONFLICT", `Expected worker version ${expected}`);
  return { ...worker, status: "READY", versions: [...worker.versions, version] };
}

export function deployVersion(worker: WorkerAggregate, versionId: string): WorkerAggregate {
  if (worker.status === "ARCHIVED") throw new AgentCloudError("INVALID_STATE_TRANSITION", "Archived workers cannot be deployed");
  if (!worker.versions.some((version) => version.id === versionId)) throw new AgentCloudError("NOT_FOUND", "Worker version not found");
  return { ...worker, status: "DEPLOYED", activeVersionId: versionId };
}

export function pauseWorker(worker: WorkerAggregate): WorkerAggregate {
  if (worker.status !== "DEPLOYED") throw new AgentCloudError("INVALID_STATE_TRANSITION", "Only deployed workers can be paused");
  return { ...worker, status: "PAUSED" };
}

export function resumeWorker(worker: WorkerAggregate): WorkerAggregate {
  if (worker.status !== "PAUSED") throw new AgentCloudError("INVALID_STATE_TRANSITION", "Only paused workers can be resumed");
  return { ...worker, status: "DEPLOYED" };
}

export function rollbackWorker(worker: WorkerAggregate, historicalVersionId: string): WorkerAggregate {
  return deployVersion(worker, historicalVersionId);
}
