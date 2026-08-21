import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { decryptMcpCredentials, encryptMcpCredentials } from "@/integrations/mcp-credential-vault";

describe("MCP credential vault", () => {
  it("round-trips credentials without exposing cleartext", () => {
    const key = randomBytes(32).toString("base64"); const binding = { organizationId: "org_1", connectionId: "connection_1", provider: "hubspot" };
    const encrypted = encryptMcpCredentials({ access_token: "secret-token", refresh_token: "refresh-token" }, binding, key);
    expect(encrypted).not.toContain("secret-token");
    expect(decryptMcpCredentials(encrypted, binding, key)).toEqual({ access_token: "secret-token", refresh_token: "refresh-token" });
  });

  it("rejects ciphertext copied to another tenant, connection, or provider", () => {
    const key = randomBytes(32).toString("base64"); const binding = { organizationId: "org_1", connectionId: "connection_1", provider: "hubspot" };
    const encrypted = encryptMcpCredentials({ access_token: "secret-token" }, binding, key);
    expect(() => decryptMcpCredentials(encrypted, { ...binding, organizationId: "org_2" }, key)).toThrow("MCP_CREDENTIAL_DECRYPTION_FAILED");
    expect(() => decryptMcpCredentials(encrypted, { ...binding, provider: "slack" }, key)).toThrow("MCP_CREDENTIAL_DECRYPTION_FAILED");
    expect(() => decryptMcpCredentials(encrypted, { ...binding, connectionId: "connection_2" }, key)).toThrow("MCP_CREDENTIAL_DECRYPTION_FAILED");
  });

  it("requires an exact 256-bit key", () => {
    expect(() => encryptMcpCredentials({}, { organizationId: "org", connectionId: "connection", provider: "gmail" }, "not-a-key")).toThrow("MCP_CONNECTION_ENCRYPTION_KEY_INVALID");
  });
});
