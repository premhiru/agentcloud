export class WebhookDeduper {
  private readonly seen = new Map<string, { runId: string; payloadHash: string }>();
  claim(input: Readonly<{ organizationId: string; triggerId: string; idempotencyKey: string; payloadHash: string }>): { duplicate: boolean; runId: string } {
    const key = `${input.organizationId}:${input.triggerId}:${input.idempotencyKey}`;
    const current = this.seen.get(key);
    if (current) {
      if (current.payloadHash !== input.payloadHash) throw new Error("WEBHOOK_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD");
      return { duplicate: true, runId: current.runId };
    }
    const runId = crypto.randomUUID(); this.seen.set(key, { runId, payloadHash: input.payloadHash }); return { duplicate: false, runId };
  }
}
