import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot contain non-finite numbers");
    }
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, normalize(item)]);
  return Object.fromEntries(entries);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function hashCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export const hashWorkerSpec = hashCanonical;
export const hashActionRequest = hashCanonical;
