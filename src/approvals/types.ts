export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "CANCELLED";
export type ApprovalRecord = {
  id: string; organizationId: string; workerId: string; workerVersionId: string; runId: string; modelToolCallId: string;
  capabilityId: string; redactedInputPreview: Record<string, unknown>; normalizedInput: unknown; requestHash: string; reason: string;
  status: ApprovalStatus; waitpointId: string; requestedAt: Date; expiresAt: Date; decidedAt?: Date; decidedBy?: string; comment?: string;
};

export interface ApprovalRepository {
  create(record: ApprovalRecord): Promise<void>;
  get(input: Readonly<{ organizationId: string; approvalId: string }>): Promise<ApprovalRecord | undefined>;
  update(record: ApprovalRecord): Promise<void>;
}

export interface ApprovalWaitpoints {
  create(input: Readonly<{ idempotencyKey: string; expiresAt: Date; tags: string[] }>): Promise<{ id: string }>;
  complete(id: string, output: Readonly<{ decision: "approved" | "rejected"; requestHash: string; comment?: string }>): Promise<void>;
}

export interface ApprovalNotifier {
  requested(record: ApprovalRecord): Promise<void>;
}
