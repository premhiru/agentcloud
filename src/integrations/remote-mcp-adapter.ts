import { getCapability, type IntegrationProvider } from "@/domain/tool-registry";
import type { ConnectionState, ExecutionContext, ExecutionResult, IntegrationAdapter } from "./types";

export const officialMcpServers = {
  gmail: "https://gmailmcp.googleapis.com/mcp/v1",
  hubspot: "https://mcp.hubspot.com",
  slack: "https://mcp.slack.com/mcp",
} as const satisfies Record<IntegrationProvider, string>;

export const officialMcpToolMap = {
  "gmail.search_messages": "search_threads",
  "gmail.read_message": "get_message",
  "hubspot.search_contacts": "search_crm_objects",
  "hubspot.get_contact": "get_crm_objects",
  "hubspot.upsert_contact": "manage_crm_objects",
  "hubspot.create_note": "manage_crm_objects",
  "slack.post_message": "slack_send_message",
} as const;

export type OfficialMcpCapability = keyof typeof officialMcpToolMap;

export type RemoteMcpConnection = Readonly<{
  organizationId: string;
  provider: IntegrationProvider;
  connectionId: string;
  displayName: string;
  status: "CONNECTED" | "EXPIRED" | "REVOKED" | "ERROR";
  supportedCapabilities: readonly string[];
}>;

export interface RemoteMcpConnectionRepository {
  get(input: Readonly<{ organizationId: string; provider: IntegrationProvider }>): Promise<RemoteMcpConnection | undefined>;
}

export interface RemoteMcpGateway {
  call(input: Readonly<{ connection: RemoteMcpConnection; serverUrl: string; toolName: string; arguments: Record<string, unknown> }>): Promise<Readonly<{ data: Record<string, unknown>; externalReference?: string }>>;
}

function argumentsFor(capabilityId: OfficialMcpCapability, input: Record<string, unknown>): Record<string, unknown> {
  switch (capabilityId) {
    case "gmail.search_messages": return { query: input.query, max_results: input.maxResults };
    case "gmail.read_message": return { message_id: input.messageId };
    case "hubspot.search_contacts": return { object_type: "contacts", query: input.email ?? input.query, limit: 10 };
    case "hubspot.get_contact": return { object_type: "contacts", object_ids: [input.contactId], properties: ["email", "firstname", "lastname", "lifecyclestage"] };
    case "hubspot.upsert_contact": return { object_type: "contacts", operation: "upsert", unique_property: "email", objects: [{ properties: { email: input.email, firstname: input.firstName, lastname: input.lastName, lifecyclestage: input.lifecycleStage } }] };
    case "hubspot.create_note": return { object_type: "notes", operation: "create", objects: [{ properties: { hs_note_body: input.body }, associations: [{ object_type: "contacts", object_id: input.contactId }] }] };
    case "slack.post_message": return { channel_id: input.channelId, message: input.text };
  }
}

export function supportedCapabilitiesForTools(provider: IntegrationProvider, toolNames: readonly string[]): string[] {
  const available = new Set(toolNames);
  return Object.entries(officialMcpToolMap)
    .filter(([capabilityId, toolName]) => capabilityId.startsWith(`${provider}.`) && available.has(toolName))
    .map(([capabilityId]) => capabilityId)
    .sort();
}

export class MemoryRemoteMcpConnectionRepository implements RemoteMcpConnectionRepository {
  constructor(private readonly connections: readonly RemoteMcpConnection[]) {}
  async get(input: Readonly<{ organizationId: string; provider: IntegrationProvider }>) {
    return this.connections.find((connection) => connection.organizationId === input.organizationId && connection.provider === input.provider);
  }
}

export class RemoteMcpIntegrationAdapter implements IntegrationAdapter {
  constructor(private readonly connections: RemoteMcpConnectionRepository, private readonly gateway: RemoteMcpGateway) {}

  async getConnectionStatus(input: Readonly<{ organizationId: string; provider: IntegrationProvider; capabilityId?: string }>): Promise<ConnectionState> {
    const connection = await this.connections.get(input);
    if (!connection || connection.status !== "CONNECTED") return { provider: input.provider, connected: false, reason: connection ? `Connection is ${connection.status.toLowerCase()}` : "Official MCP connection is missing" };
    if (input.capabilityId && !connection.supportedCapabilities.includes(input.capabilityId)) return { provider: input.provider, connected: false, reason: "Connected MCP server does not expose this capability" };
    return { provider: input.provider, connected: true, connectionId: connection.connectionId, displayName: connection.displayName };
  }

  async executeCapability(capabilityId: string, input: unknown, context: ExecutionContext): Promise<ExecutionResult> {
    const capability = getCapability(capabilityId);
    if (!capability || !(capabilityId in officialMcpToolMap)) return { ok: false, classification: "POLICY", message: "Capability is not allowlisted for official MCP execution" };
    const parsed = capability.inputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, classification: "PERMANENT", message: "Invalid capability input" };
    if (context.mode === "dry_run" && capability.effect !== "read") return { ok: true, data: { dryRun: true, wouldExecute: { capability: capabilityId, input: parsed.data } } };
    const connection = await this.connections.get({ organizationId: context.organizationId, provider: capability.integration });
    if (!connection || connection.status !== "CONNECTED" || !connection.supportedCapabilities.includes(capabilityId)) return { ok: false, classification: "AUTHENTICATION", message: "An official MCP connection with this capability is required" };
    try {
      const result = await this.gateway.call({ connection, serverUrl: officialMcpServers[capability.integration], toolName: officialMcpToolMap[capabilityId as OfficialMcpCapability], arguments: argumentsFor(capabilityId as OfficialMcpCapability, parsed.data as Record<string, unknown>) });
      return { ok: true, data: result.data, externalReference: result.externalReference };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Remote MCP request failed";
      if (/401|403|unauthor|auth|token|credential/i.test(message)) return { ok: false, classification: "AUTHENTICATION", message: "Official MCP connection authentication failed" };
      if (/429|rate.?limit/i.test(message)) return { ok: false, classification: "RATE_LIMIT", message: "Official MCP server rate limit reached" };
      if (capability.effect !== "read" && /timeout|socket|network|abort/i.test(message)) return { ok: false, classification: "UNKNOWN_OUTCOME", message: "Write outcome could not be confirmed" };
      return { ok: false, classification: "TRANSIENT", message: "Official MCP request failed" };
    }
  }
}

export class RoutedIntegrationAdapter implements IntegrationAdapter {
  constructor(private readonly preferred: IntegrationAdapter, private readonly fallback: IntegrationAdapter) {}

  async getConnectionStatus(input: Readonly<{ organizationId: string; provider: IntegrationProvider; capabilityId?: string }>): Promise<ConnectionState> {
    const preferred = await this.preferred.getConnectionStatus(input);
    return preferred.connected ? preferred : this.fallback.getConnectionStatus(input);
  }

  async executeCapability(capabilityId: string, input: unknown, context: ExecutionContext): Promise<ExecutionResult> {
    const capability = getCapability(capabilityId);
    if (!capability) return { ok: false, classification: "POLICY", message: "Unknown capability" };
    const preferred = await this.preferred.getConnectionStatus({ organizationId: context.organizationId, provider: capability.integration, capabilityId });
    return preferred.connected ? this.preferred.executeCapability(capabilityId, input, context) : this.fallback.executeCapability(capabilityId, input, context);
  }
}
