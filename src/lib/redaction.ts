const secretKey = /^(authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|secret|password|cookie)$/i;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, secretKey.test(key) ? "[REDACTED]" : redactSecrets(item)]));
}
