import { z } from "zod";

export type IntegrationProvider = "gmail" | "hubspot" | "slack";
export type CapabilityEffect = "read" | "write" | "external_communication";
export type CapabilityRisk = "low" | "medium" | "high";

export type CapabilityDefinition = Readonly<{
  id: string;
  integration: IntegrationProvider;
  description: string;
  effect: CapabilityEffect;
  risk: CapabilityRisk;
  inputSchema: z.ZodType;
  outputSchema?: z.ZodType;
  supportsDryRun: boolean;
}>;

const email = z.string().email();
const nonEmpty = z.string().trim().min(1);

const capabilities = [
  {
    id: "gmail.search_messages", integration: "gmail", description: "Search Gmail messages with a bounded query", effect: "read", risk: "low", supportsDryRun: true,
    inputSchema: z.object({ query: nonEmpty.max(500), maxResults: z.number().int().min(1).max(50).default(10) }).strict(),
    outputSchema: z.object({ messages: z.array(z.object({ id: nonEmpty, subject: z.string(), from: email }).strict()) }).strict(),
  },
  {
    id: "gmail.read_message", integration: "gmail", description: "Read a Gmail message by ID", effect: "read", risk: "low", supportsDryRun: true,
    inputSchema: z.object({ messageId: nonEmpty.max(500) }).strict(),
  },
  {
    id: "gmail.send_email", integration: "gmail", description: "Send one external email", effect: "external_communication", risk: "high", supportsDryRun: true,
    inputSchema: z.object({ to: z.array(email).min(1).max(20), subject: nonEmpty.max(998), body: nonEmpty.max(50_000), replyToMessageId: z.string().max(500).optional() }).strict(),
  },
  {
    id: "hubspot.search_contacts", integration: "hubspot", description: "Search HubSpot contacts", effect: "read", risk: "low", supportsDryRun: true,
    inputSchema: z.object({ email: email.optional(), query: z.string().max(500).optional() }).strict().refine((value) => value.email || value.query, "email or query is required"),
  },
  {
    id: "hubspot.get_contact", integration: "hubspot", description: "Read a HubSpot contact", effect: "read", risk: "low", supportsDryRun: true,
    inputSchema: z.object({ contactId: nonEmpty.max(500) }).strict(),
  },
  {
    id: "hubspot.upsert_contact", integration: "hubspot", description: "Create or update a single HubSpot contact", effect: "write", risk: "medium", supportsDryRun: true,
    inputSchema: z.object({ email, firstName: z.string().max(200).optional(), lastName: z.string().max(200).optional(), lifecycleStage: z.enum(["lead", "marketingqualifiedlead", "salesqualifiedlead", "opportunity", "customer"]).optional() }).strict(),
  },
  {
    id: "hubspot.create_note", integration: "hubspot", description: "Create a note on a HubSpot contact", effect: "write", risk: "medium", supportsDryRun: true,
    inputSchema: z.object({ contactId: nonEmpty.max(500), body: nonEmpty.max(10_000) }).strict(),
  },
  {
    id: "slack.list_channels", integration: "slack", description: "List Slack channels", effect: "read", risk: "low", supportsDryRun: true,
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(25) }).strict(),
  },
  {
    id: "slack.post_message", integration: "slack", description: "Post a message to one Slack channel", effect: "external_communication", risk: "medium", supportsDryRun: true,
    inputSchema: z.object({ channelId: nonEmpty.max(500), text: nonEmpty.max(40_000) }).strict(),
  },
] as const satisfies readonly CapabilityDefinition[];

const registry = new Map<string, CapabilityDefinition>(capabilities.map((capability) => [capability.id, capability]));

export function listCapabilities(): readonly CapabilityDefinition[] {
  return capabilities;
}

export function getCapability(id: string): CapabilityDefinition | undefined {
  return registry.get(id);
}

export function requireCapability(id: string): CapabilityDefinition {
  const capability = getCapability(id);
  if (!capability) throw new Error(`Unknown capability: ${id}`);
  return capability;
}

export function validateRegisteredCapabilities(ids: readonly string[]): { supported: string[]; unsupported: string[] } {
  return ids.reduce<{ supported: string[]; unsupported: string[] }>((result, capability) => {
    (registry.has(capability) ? result.supported : result.unsupported).push(capability);
    return result;
  }, { supported: [], unsupported: [] });
}
