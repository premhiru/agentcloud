import type { IntegrationProvider } from "@/domain/tool-registry";

export type ConnectionState = Readonly<{ provider: IntegrationProvider; connected: boolean; connectionId?: string; displayName?: string; reason?: string }>;
export type ExecutionMode = "dry_run" | "live";
export type ExecutionContext = Readonly<{ organizationId: string; workerId: string; workerVersionId: string; runId: string; modelToolCallId: string; mode: ExecutionMode }>;
export type ExecutionResult = Readonly<{ ok: true; data: Record<string, unknown>; externalReference?: string }> | Readonly<{ ok: false; classification: "TRANSIENT" | "PERMANENT" | "AUTHENTICATION" | "RATE_LIMIT" | "POLICY" | "UNKNOWN_OUTCOME"; message: string }>;

export interface IntegrationAdapter {
  getConnectionStatus(input: Readonly<{ organizationId: string; provider: IntegrationProvider; capabilityId?: string }>): Promise<ConnectionState>;
  executeCapability(capabilityId: string, input: unknown, context: ExecutionContext): Promise<ExecutionResult>;
}
