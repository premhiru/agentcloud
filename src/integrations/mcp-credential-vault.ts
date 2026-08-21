import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function keyBytes(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("MCP_CONNECTION_ENCRYPTION_KEY_INVALID");
  return key;
}

function aad(input: Readonly<{ organizationId: string; connectionId: string; provider: string }>): Buffer {
  return Buffer.from(`${input.organizationId}\n${input.connectionId}\n${input.provider}`, "utf8");
}

export function encryptMcpCredentials(value: unknown, binding: Readonly<{ organizationId: string; connectionId: string; provider: string }>, encodedKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(encodedKey), iv);
  cipher.setAAD(aad(binding));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptMcpCredentials<T>(ciphertext: string, binding: Readonly<{ organizationId: string; connectionId: string; provider: string }>, encodedKey: string): T {
  const [version, ivText, tagText, payloadText, ...extra] = ciphertext.split(".");
  if (version !== VERSION || !ivText || !tagText || !payloadText || extra.length) throw new Error("MCP_CREDENTIAL_CIPHERTEXT_INVALID");
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyBytes(encodedKey), Buffer.from(ivText, "base64url"));
    decipher.setAAD(aad(binding));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    const cleartext = Buffer.concat([decipher.update(Buffer.from(payloadText, "base64url")), decipher.final()]).toString("utf8");
    return JSON.parse(cleartext) as T;
  } catch {
    throw new Error("MCP_CREDENTIAL_DECRYPTION_FAILED");
  }
}
