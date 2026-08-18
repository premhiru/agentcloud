import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_WEBHOOK_BYTES = 256 * 1024;
const dangerousKeys = new Set(["__proto__", "constructor", "prototype"]);

function containsDangerousKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsDangerousKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, item]) => dangerousKeys.has(key) || containsDangerousKey(item));
}

export function verifyWebhookSignature(body: string, signature: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !signature) return false;
  const supplied = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return timingSafeEqual(Buffer.from(supplied.toLowerCase(), "hex"), Buffer.from(expected, "hex"));
}

export function parseWebhookBody(body: string): Record<string, unknown> {
  if (Buffer.byteLength(body, "utf8") > MAX_WEBHOOK_BYTES) throw new Error("WEBHOOK_PAYLOAD_TOO_LARGE");
  let value: unknown;
  try { value = JSON.parse(body); } catch { throw new Error("WEBHOOK_INVALID_JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("WEBHOOK_PAYLOAD_INVALID");
  if (containsDangerousKey(value)) throw new Error("WEBHOOK_DANGEROUS_KEY");
  return value as Record<string, unknown>;
}
