import { getCapability, type IntegrationProvider } from "@/domain/tool-registry";
import type { ConnectionState, ExecutionContext, ExecutionResult, IntegrationAdapter } from "./types";

export type RecordedFakeWrite = Readonly<{ capabilityId: string; input: unknown; context: ExecutionContext }>;

export class FakeIntegrationAdapter implements IntegrationAdapter {
  readonly writes: RecordedFakeWrite[] = [];
  private readonly disconnected = new Set<IntegrationProvider>();

  setConnected(provider: IntegrationProvider, connected: boolean): void {
    if (connected) this.disconnected.delete(provider);
    else this.disconnected.add(provider);
  }

  async getConnectionStatus(input: Readonly<{ organizationId: string; provider: IntegrationProvider }>): Promise<ConnectionState> {
    if (this.disconnected.has(input.provider)) return { provider: input.provider, connected: false, reason: "Demo connection revoked" };
    return { provider: input.provider, connected: true, connectionId: `demo_${input.organizationId}_${input.provider}`, displayName: `Demo ${input.provider[0]!.toUpperCase()}${input.provider.slice(1)}` };
  }

  async executeCapability(capabilityId: string, input: unknown, context: ExecutionContext): Promise<ExecutionResult> {
    const capability = getCapability(capabilityId);
    if (!capability) return { ok: false, classification: "POLICY", message: "Unknown capability" };
    const parsed = capability.inputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, classification: "PERMANENT", message: "Invalid capability input" };
    if (this.disconnected.has(capability.integration)) return { ok: false, classification: "AUTHENTICATION", message: "Connection is not active" };

    if (context.mode === "dry_run" && capability.effect !== "read") {
      return { ok: true, data: { dryRun: true, wouldExecute: { capability: capabilityId, input: parsed.data } } };
    }

    if (capability.effect !== "read") this.writes.push({ capabilityId, input: parsed.data, context });
    return { ok: true, data: this.fixture(capabilityId, parsed.data), externalReference: capability.effect === "read" ? undefined : `demo_${context.modelToolCallId}` };
  }

  private fixture(capabilityId: string, input: unknown): Record<string, unknown> {
    switch (capabilityId) {
      case "gmail.search_messages": return { messages: [{ id: "msg_lead_001", subject: "Enterprise pricing enquiry", from: "maya@northstar.example" }] };
      case "gmail.read_message": return { id: "msg_lead_001", from: "maya@northstar.example", subject: "Enterprise pricing enquiry", body: "We need 80 seats and would like to speak this week." };
      case "hubspot.search_contacts": return { contacts: [] };
      case "hubspot.get_contact": return { id: "contact_demo_001", email: "maya@northstar.example", lifecycleStage: "lead" };
      case "slack.list_channels": return { channels: [{ id: "C_SALES", name: "sales-qualified" }] };
      case "gmail.send_email": return { sent: true, messageId: "sent_demo_001" };
      case "hubspot.upsert_contact": return { contactId: "contact_demo_001", created: true };
      case "hubspot.create_note": return { noteId: "note_demo_001" };
      case "slack.post_message": return { channelId: "C_SALES", timestamp: "1787020800.000001" };
      default: return { input };
    }
  }
}
