import { Composio } from "@composio/core";

import { getCapability, type IntegrationProvider } from "@/domain/tool-registry";
import type { ConnectionState, ExecutionContext, ExecutionResult, IntegrationAdapter } from "./types";

export const composioToolkitVersions = { gmail: "20260721_00", hubspot: "20260721_00", slack: "20260721_00" } as const;
export const composioToolMap = {
  "gmail.search_messages": "GMAIL_FETCH_EMAILS",
  "gmail.read_message": "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
  "gmail.send_email": "GMAIL_SEND_EMAIL",
  "hubspot.search_contacts": "HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA",
  "hubspot.get_contact": "HUBSPOT_READ_CONTACT",
  "hubspot.upsert_contact": "HUBSPOT_CREATE_CONTACT",
  "hubspot.create_note": "HUBSPOT_CREATE_NOTE",
  "slack.list_channels": "SLACK_LIST_ALL_CHANNELS",
  "slack.post_message": "SLACK_CHAT_POST_MESSAGE",
} as const;

export type ComposioConfigurationStatus = Readonly<{
  configured: boolean;
  missing: readonly string[];
  authConfigEnvKey: string;
}>;

export function getComposioConfiguration(provider: IntegrationProvider): ComposioConfigurationStatus {
  const authConfigEnvKey = `COMPOSIO_AUTH_CONFIG_${provider.toUpperCase()}`;
  const missing = [
    ...(!process.env.COMPOSIO_API_KEY ? ["COMPOSIO_API_KEY"] : []),
    ...(!process.env[authConfigEnvKey] ? [authConfigEnvKey] : []),
  ];
  return { configured: missing.length === 0, missing, authConfigEnvKey };
}

export type ConnectionReference = Readonly<{ organizationId: string; provider: IntegrationProvider; connectedAccountId: string; status: "CONNECTED" | "EXPIRED" | "REVOKED" | "ERROR"; displayName: string }>;
export interface ConnectionReferenceRepository { get(input: Readonly<{ organizationId: string; provider: IntegrationProvider }>): Promise<ConnectionReference | undefined>; }
export interface ComposioGateway { execute(slug: string, body: { userId: string; connectedAccountId: string; arguments: Record<string, unknown> }): Promise<{ successful?: boolean; data?: unknown; error?: unknown; logId?: string }>; link(userId: string, authConfigId: string, options: { callbackUrl: string }): Promise<{ id: string; redirectUrl?: string | null }>; get?(id: string): Promise<{ id: string; status: string; toolkit: { slug: string }; alias?: string | null }>; }

export function createComposioGateway(): ComposioGateway {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY_REQUIRED");
  const composio = new Composio({ apiKey, toolkitVersions: composioToolkitVersions, allowTracking: false, dangerouslyAllowAutoUploadDownloadFiles: false });
  return {
    execute: (slug, body) => composio.tools.execute(slug, body),
    link: (userId, authConfigId, options) => composio.connectedAccounts.link(userId, authConfigId, options),
    get: (id) => composio.connectedAccounts.get(id),
  };
}

export class MemoryConnectionReferenceRepository implements ConnectionReferenceRepository {
  constructor(private readonly references: ConnectionReference[]) {}
  async get(input: Readonly<{ organizationId: string; provider: IntegrationProvider }>) { return this.references.find((item) => item.organizationId === input.organizationId && item.provider === input.provider); }
}

function argumentsFor(capabilityId: string, input: Record<string, unknown>): Record<string, unknown> {
  switch (capabilityId) {
    case "gmail.search_messages": return { query: input.query, max_results: input.maxResults, user_id: "me" };
    case "gmail.read_message": return { message_id: input.messageId, user_id: "me", format: "full" };
    case "gmail.send_email": { const recipients = input.to as string[]; return { recipient_email: recipients[0], extra_recipients: recipients.slice(1), subject: input.subject, body: input.body, user_id: "me", is_html: false }; }
    case "hubspot.search_contacts": return { filter_groups: [{ filters: input.email ? [{ propertyName: "email", operator: "EQ", value: input.email }] : [{ propertyName: "email", operator: "CONTAINS_TOKEN", value: input.query }] }], properties: ["email", "firstname", "lastname", "lifecyclestage"], limit: 10 };
    case "hubspot.get_contact": return { contact_id: input.contactId, properties: ["email", "firstname", "lastname", "lifecyclestage"] };
    case "hubspot.upsert_contact": return { properties: { email: input.email, firstname: input.firstName, lastname: input.lastName, lifecyclestage: input.lifecycleStage } };
    case "hubspot.create_note": return { properties: { hs_note_body: input.body, hs_timestamp: new Date().toISOString() }, associations: [{ to: { id: input.contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }] };
    case "slack.list_channels": return { limit: input.limit, exclude_archived: true };
    case "slack.post_message": return { channel: input.channelId, text: input.text };
    default: throw new Error("UNMAPPED_CAPABILITY");
  }
}

export class ComposioIntegrationAdapter implements IntegrationAdapter {
  constructor(private readonly connections: ConnectionReferenceRepository, private readonly gateway: ComposioGateway) {}

  async getConnectionStatus(input: Readonly<{ organizationId: string; provider: IntegrationProvider }>): Promise<ConnectionState> {
    const connection = await this.connections.get(input);
    return connection?.status === "CONNECTED" ? { provider: input.provider, connected: true, connectionId: connection.connectedAccountId, displayName: connection.displayName } : { provider: input.provider, connected: false, reason: connection ? `Connection is ${connection.status.toLowerCase()}` : "Connection is missing" };
  }

  async executeCapability(capabilityId: string, input: unknown, context: ExecutionContext): Promise<ExecutionResult> {
    const capability = getCapability(capabilityId); if (!capability) return { ok: false, classification: "POLICY", message: "Unknown capability" };
    const parsed = capability.inputSchema.safeParse(input); if (!parsed.success) return { ok: false, classification: "PERMANENT", message: "Invalid capability input" };
    if (context.mode === "dry_run" && capability.effect !== "read") return { ok: true, data: { dryRun: true, wouldExecute: { capability: capabilityId, input: parsed.data } } };
    const connection = await this.connections.get({ organizationId: context.organizationId, provider: capability.integration });
    if (!connection || connection.status !== "CONNECTED") return { ok: false, classification: "AUTHENTICATION", message: "Active connection required" };
    try {
      const response = await this.gateway.execute(composioToolMap[capabilityId as keyof typeof composioToolMap], { userId: context.organizationId, connectedAccountId: connection.connectedAccountId, arguments: argumentsFor(capabilityId, parsed.data as Record<string, unknown>) });
      if (response.successful === false || response.error) return { ok: false, classification: "PERMANENT", message: "Integration rejected the request" };
      return { ok: true, data: (response.data && typeof response.data === "object" ? response.data : { result: response.data }) as Record<string, unknown>, externalReference: response.logId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Integration request failed";
      if (/401|403|auth|credential/i.test(message)) return { ok: false, classification: "AUTHENTICATION", message: "Connection authentication failed" };
      if (/429|rate.?limit/i.test(message)) return { ok: false, classification: "RATE_LIMIT", message: "Integration rate limit reached" };
      if (capability.effect !== "read" && /timeout|socket|network|abort/i.test(message)) return { ok: false, classification: "UNKNOWN_OUTCOME", message: "Write outcome could not be confirmed" };
      return { ok: false, classification: "TRANSIENT", message: "Integration request failed" };
    }
  }
}

export async function createConnectionLink(input: Readonly<{ organizationId: string; provider: IntegrationProvider; callbackUrl: string; gateway?: ComposioGateway }>) {
  const configuration = getComposioConfiguration(input.provider);
  if (!configuration.configured) throw new Error(`${configuration.missing[0]}_REQUIRED`);
  const authConfigId = process.env[configuration.authConfigEnvKey]!;
  const request = await (input.gateway ?? createComposioGateway()).link(input.organizationId, authConfigId, { callbackUrl: input.callbackUrl });
  if (!request.redirectUrl) throw new Error("COMPOSIO_CONNECTION_URL_MISSING");
  return { connectionRequestId: request.id, redirectUrl: request.redirectUrl };
}
