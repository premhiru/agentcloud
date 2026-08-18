export const errorCodes = [
  "WORKER_NOT_FOUND",
  "WORKER_PAUSED",
  "CONNECTION_REQUIRED",
  "AUTHORITY_DENIED",
  "APPROVAL_REQUIRED",
  "BUDGET_EXCEEDED",
  "OUTCOME_UNKNOWN",
  "INVALID_WORKER_SPEC",
  "TENANT_ACCESS_DENIED",
  "INVALID_STATE_TRANSITION",
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "CONFLICT",
] as const;

export type AgentCloudErrorCode = (typeof errorCodes)[number];

export class AgentCloudError extends Error {
  constructor(
    public readonly code: AgentCloudErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AgentCloudError";
  }
}
