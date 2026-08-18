import type { TriggerSpec } from "@/domain/worker-spec";

export type RunWorkerPayload = Readonly<{
  organizationId: string;
  workerId: string;
  workerVersionId: string;
  runId: string;
  mode: "dry_run" | "live";
  trigger: { type: "manual" | "schedule" | "webhook"; payload: Record<string, unknown> };
}>;

export type RuntimeDeployment = Readonly<{ provider: string; deploymentId: string; scheduleIds: Record<string, string> }>;
export type RuntimeRunHandle = Readonly<{ runtimeRunId: string; status: "QUEUED" }>;

export interface WorkerRuntime {
  deployWorker(input: Readonly<{ organizationId: string; workerId: string; workerVersionId: string; triggers: readonly TriggerSpec[]; existing?: RuntimeDeployment }>): Promise<RuntimeDeployment>;
  pauseWorker(input: Readonly<{ organizationId: string; workerId: string; deployment: RuntimeDeployment }>): Promise<void>;
  resumeWorker(input: Readonly<{ organizationId: string; workerId: string; deployment: RuntimeDeployment }>): Promise<void>;
  triggerRun(payload: RunWorkerPayload): Promise<RuntimeRunHandle>;
  cancelRun(input: Readonly<{ organizationId: string; runId: string; runtimeRunId: string }>): Promise<void>;
}
