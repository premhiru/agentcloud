import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { MAX_WEBHOOK_BYTES, parseWebhookBody, verifyWebhookSignature } from "@/runtime/webhook-security";

describe("webhook request safety", () => {
  const secret = "a-production-strength-webhook-secret-value";
  it("accepts only a matching HMAC signature", () => {
    const body = JSON.stringify({ event: "lead.created" });
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, `sha256=${signature}`, secret)).toBe(true);
    expect(verifyWebhookSignature(`${body} `, `sha256=${signature}`, secret)).toBe(false);
    expect(verifyWebhookSignature(body, signature, "short")).toBe(false);
  });
  it("rejects oversized, non-object, malformed, and prototype-shaped bodies", () => {
    expect(() => parseWebhookBody(`{"value":"${"x".repeat(MAX_WEBHOOK_BYTES)}"}`)).toThrow("WEBHOOK_PAYLOAD_TOO_LARGE");
    expect(() => parseWebhookBody("[]")).toThrow("WEBHOOK_PAYLOAD_INVALID");
    expect(() => parseWebhookBody("{")) .toThrow("WEBHOOK_INVALID_JSON");
    expect(() => parseWebhookBody('{"nested":{"__proto__":{"admin":true}}}')).toThrow("WEBHOOK_DANGEROUS_KEY");
  });
});
