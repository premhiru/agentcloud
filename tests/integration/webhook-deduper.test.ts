import { describe, expect, it } from "vitest";

import { WebhookDeduper } from "@/runtime/webhook-deduper";

describe("webhook deduplication", () => {
  it("returns the original run for a duplicate event", () => {
    const deduper = new WebhookDeduper(); const event = { organizationId: "org_1", triggerId: "trigger_1", idempotencyKey: "event_1", payloadHash: "hash" };
    const first = deduper.claim(event); const duplicate = deduper.claim(event);
    expect(first.duplicate).toBe(false); expect(duplicate).toEqual({ duplicate: true, runId: first.runId });
  });

  it("isolates deduplication by tenant and trigger", () => {
    const deduper = new WebhookDeduper();
    const first = deduper.claim({ organizationId: "org_1", triggerId: "trigger_1", idempotencyKey: "same", payloadHash: "a" });
    const other = deduper.claim({ organizationId: "org_2", triggerId: "trigger_1", idempotencyKey: "same", payloadHash: "a" });
    expect(other.duplicate).toBe(false); expect(other.runId).not.toBe(first.runId);
  });

  it("rejects a reused event key with a changed payload", () => {
    const deduper = new WebhookDeduper();
    deduper.claim({ organizationId: "org_1", triggerId: "trigger_1", idempotencyKey: "same", payloadHash: "a" });
    expect(() => deduper.claim({ organizationId: "org_1", triggerId: "trigger_1", idempotencyKey: "same", payloadHash: "b" })).toThrow("DIFFERENT_PAYLOAD");
  });
});
