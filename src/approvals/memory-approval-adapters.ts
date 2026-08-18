import type { ApprovalNotifier, ApprovalRecord, ApprovalRepository, ApprovalWaitpoints } from "./types";

export class MemoryApprovalRepository implements ApprovalRepository {
  private readonly records = new Map<string, ApprovalRecord>();
  async create(record: ApprovalRecord) { if (this.records.has(record.id)) throw new Error("APPROVAL_ALREADY_EXISTS"); this.records.set(record.id, structuredClone(record)); }
  async get(input: Readonly<{ organizationId: string; approvalId: string }>) { const record = this.records.get(input.approvalId); return record?.organizationId === input.organizationId ? structuredClone(record) : undefined; }
  async update(record: ApprovalRecord) { const current = this.records.get(record.id); if (!current || current.organizationId !== record.organizationId) throw new Error("APPROVAL_NOT_FOUND"); this.records.set(record.id, structuredClone(record)); }
}

export class FakeApprovalWaitpoints implements ApprovalWaitpoints {
  readonly completed = new Map<string, unknown>(); private readonly ids = new Map<string, string>();
  async create(input: Readonly<{ idempotencyKey: string }>) { const id = this.ids.get(input.idempotencyKey) ?? `wait_${crypto.randomUUID()}`; this.ids.set(input.idempotencyKey, id); return { id }; }
  async complete(id: string, output: unknown) { if (this.completed.has(id)) return; this.completed.set(id, structuredClone(output)); }
}

export class MemoryApprovalNotifier implements ApprovalNotifier {
  readonly notifications: ApprovalRecord[] = [];
  async requested(record: ApprovalRecord) { this.notifications.push(structuredClone(record)); }
}
