import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { connections, organizationMemberships, organizations, users } from "@/db/schema";
import type { IntegrationProvider } from "@/domain/tool-registry";
import type { TenantContext } from "@/lib/auth/tenant-context";
import { createComposioGateway, createConnectionLink, getComposioConfiguration, type ComposioGateway } from "./composio-adapter";
import { safeConnectionReturnTo } from "./connection-return";
import { decryptMcpCredentials, encryptMcpCredentials } from "./mcp-credential-vault";
import { beginOfficialMcpAuthorization, completeOfficialMcpAuthorization, getOfficialMcpConfiguration, type OfficialMcpOAuthState } from "./official-mcp-client";
import { supportedCapabilitiesForTools } from "./remote-mcp-adapter";

type ConnectionMethod = "official_mcp" | "managed_oauth";
type McpMetadata = Record<string, unknown> & { method: "official_mcp"; pending: boolean; stateHash: string; encryptedCredentials: string; returnTo: string; supportedCapabilities?: string[] };

function validOrigin(origin: string): boolean {
  return URL.canParse(origin) && (new URL(origin).protocol === "https:" || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
}

function hashState(state: string): string { return createHash("sha256").update(state).digest("hex"); }
function sameHash(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "hex"); const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

async function organizationId(context: TenantContext): Promise<string> {
  const [row] = await getDatabase().select({ id: organizations.id }).from(organizations)
    .innerJoin(organizationMemberships, eq(organizationMemberships.organizationId, organizations.id))
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(and(eq(organizations.clerkOrganizationId, context.organizationExternalId), eq(users.clerkUserId, context.userExternalId))).limit(1);
  if (!row) throw new Error("TENANT_ACCESS_DENIED"); return row.id;
}

export function getPreferredConnectionConfiguration(provider: IntegrationProvider): Readonly<{ configured: boolean; method?: ConnectionMethod; missing: readonly string[] }> {
  const mcp = getOfficialMcpConfiguration(provider); const managed = getComposioConfiguration(provider);
  if (provider !== "gmail" && mcp.configured) return { configured: true, method: "official_mcp", missing: [] };
  if (managed.configured) return { configured: true, method: "managed_oauth", missing: [] };
  if (mcp.configured) return { configured: true, method: "official_mcp", missing: [] };
  return { configured: false, missing: [...new Set([...mcp.missing, ...managed.missing])] };
}

export async function beginConnection(input: Readonly<{ context: TenantContext; provider: IntegrationProvider; origin: string; returnTo?: string; gateway?: ComposioGateway }>) {
  if (!validOrigin(input.origin)) throw new Error("APP_BASE_URL_INVALID");
  const preferred = getPreferredConnectionConfiguration(input.provider);
  if (!preferred.configured || !preferred.method) throw new Error("INTEGRATION_CONFIGURATION_REQUIRED");
  const state = crypto.randomUUID(); const returnTo = safeConnectionReturnTo(input.returnTo); const orgId = await organizationId(input.context); const db = getDatabase();

  if (preferred.method === "managed_oauth") {
    const gateway = input.gateway ?? createComposioGateway();
    const callbackUrl = `${input.origin}/api/integrations/callback?provider=${input.provider}&state=${state}`;
    const link = await createConnectionLink({ organizationId: input.context.organizationExternalId, provider: input.provider, callbackUrl, gateway });
    await db.insert(connections).values({ organizationId: orgId, provider: input.provider, externalConnectionId: link.connectionRequestId, displayName: `Pending ${input.provider}`, status: "ERROR", metadataJson: { method: "managed_oauth", stateHash: hashState(state), pending: true, returnTo } })
      .onConflictDoUpdate({ target: [connections.organizationId, connections.provider, connections.externalConnectionId], set: { status: "ERROR", metadataJson: { method: "managed_oauth", stateHash: hashState(state), pending: true, returnTo }, updatedAt: new Date() } });
    return { ...link, method: preferred.method };
  }

  const configuration = getOfficialMcpConfiguration(input.provider).configuration!;
  const connectionId = crypto.randomUUID(); const callbackUrl = `${input.origin}/api/integrations/callback?provider=${input.provider}`;
  const binding = { organizationId: orgId, connectionId, provider: input.provider };
  let oauthState: OfficialMcpOAuthState = {};
  const persist = async (next: OfficialMcpOAuthState) => {
    oauthState = next;
    const encryptedCredentials = encryptMcpCredentials(next, binding, configuration.encryptionKey);
    await db.update(connections).set({ metadataJson: { method: "official_mcp", pending: true, stateHash: hashState(state), encryptedCredentials, returnTo }, updatedAt: new Date() }).where(and(eq(connections.organizationId, orgId), eq(connections.externalConnectionId, connectionId)));
  };
  const encryptedCredentials = encryptMcpCredentials(oauthState, binding, configuration.encryptionKey);
  await db.insert(connections).values({ organizationId: orgId, provider: input.provider, externalConnectionId: connectionId, displayName: `Pending ${input.provider} MCP`, status: "ERROR", metadataJson: { method: "official_mcp", pending: true, stateHash: hashState(state), encryptedCredentials, returnTo } });
  const redirectUrl = await beginOfficialMcpAuthorization({ provider: input.provider, callbackUrl, csrfState: state, oauthState, configuration, persist });
  return { connectionRequestId: connectionId, redirectUrl, method: preferred.method };
}

export async function completeConnection(input: Readonly<{ context: TenantContext; provider: IntegrationProvider; state: string; callbackParams?: URLSearchParams; origin?: string; gateway?: ComposioGateway }>) {
  const orgId = await organizationId(input.context); const db = getDatabase(); const expectedHash = hashState(input.state);
  const rows = await db.select().from(connections).where(and(eq(connections.organizationId, orgId), eq(connections.provider, input.provider)));
  const pending = rows.find((row) => row.metadataJson.pending === true && typeof row.metadataJson.stateHash === "string" && sameHash(row.metadataJson.stateHash, expectedHash));
  if (!pending) throw new Error("CONNECTION_STATE_INVALID");
  const method = pending.metadataJson.method === "official_mcp" ? "official_mcp" : "managed_oauth";
  const returnTo = safeConnectionReturnTo(typeof pending.metadataJson.returnTo === "string" ? pending.metadataJson.returnTo : undefined);

  if (method === "managed_oauth") {
    const gateway = input.gateway ?? createComposioGateway(); if (!gateway.get) throw new Error("COMPOSIO_CONNECTION_LOOKUP_UNAVAILABLE");
    const account = await gateway.get(pending.externalConnectionId); if (account.id !== pending.externalConnectionId || account.toolkit.slug.toLowerCase() !== input.provider || account.status !== "ACTIVE") throw new Error("CONNECTION_NOT_ACTIVE");
    const [updated] = await db.update(connections).set({ status: "CONNECTED", displayName: account.alias ?? `${input.provider} account`, metadataJson: { method, returnTo }, updatedAt: new Date() }).where(and(eq(connections.organizationId, orgId), eq(connections.id, pending.id))).returning();
    return { connection: updated, returnTo, method };
  }

  if (!input.callbackParams || !input.origin || !validOrigin(input.origin)) throw new Error("MCP_CALLBACK_INVALID");
  const metadata = pending.metadataJson as McpMetadata; const configuration = getOfficialMcpConfiguration(input.provider).configuration;
  if (!configuration || typeof metadata.encryptedCredentials !== "string") throw new Error("MCP_CONNECTION_CONFIGURATION_REQUIRED");
  const binding = { organizationId: orgId, connectionId: pending.externalConnectionId, provider: input.provider };
  let oauthState = decryptMcpCredentials<OfficialMcpOAuthState>(metadata.encryptedCredentials, binding, configuration.encryptionKey);
  const persist = async (next: OfficialMcpOAuthState) => {
    oauthState = next;
    await db.update(connections).set({ metadataJson: { ...metadata, encryptedCredentials: encryptMcpCredentials(next, binding, configuration.encryptionKey) }, updatedAt: new Date() }).where(and(eq(connections.organizationId, orgId), eq(connections.id, pending.id)));
  };
  const callbackUrl = `${input.origin}/api/integrations/callback?provider=${input.provider}`;
  const toolNames = await completeOfficialMcpAuthorization({ provider: input.provider, callbackUrl, csrfState: input.state, callbackParams: input.callbackParams, oauthState, configuration, persist });
  const supportedCapabilities = supportedCapabilitiesForTools(input.provider, toolNames);
  if (!supportedCapabilities.length) throw new Error("MCP_REQUIRED_TOOLS_MISSING");
  const encryptedCredentials = encryptMcpCredentials(oauthState, binding, configuration.encryptionKey);
  const [updated] = await db.update(connections).set({ status: "CONNECTED", displayName: `Official ${input.provider} MCP`, metadataJson: { method, pending: false, encryptedCredentials, returnTo, supportedCapabilities }, updatedAt: new Date() }).where(and(eq(connections.organizationId, orgId), eq(connections.id, pending.id))).returning();
  return { connection: updated, returnTo, method };
}
