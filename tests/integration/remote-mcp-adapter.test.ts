import { describe, expect, it } from "vitest";

import { MemoryRemoteMcpConnectionRepository, RemoteMcpIntegrationAdapter, RoutedIntegrationAdapter, supportedCapabilitiesForTools, type RemoteMcpGateway } from "@/integrations/remote-mcp-adapter";
import { ComposioIntegrationAdapter, MemoryConnectionReferenceRepository, type ComposioGateway } from "@/integrations/composio-adapter";

const context = { organizationId: "org_1", workerId: "worker_1", workerVersionId: "version_1", runId: "run_1", modelToolCallId: "call_1", mode: "live" as const };
const connection = { organizationId: "org_1", provider: "slack" as const, connectionId: "mcp_1", displayName: "Official Slack", status: "CONNECTED" as const, supportedCapabilities: ["slack.post_message"] };

describe("official remote MCP integration", () => {
  it("derives capability coverage only from the curated allowlist", () => {
    expect(supportedCapabilitiesForTools("gmail", ["search_threads", "get_message", "create_draft", "evil_shell"])).toEqual(["gmail.read_message", "gmail.search_messages"]);
    expect(supportedCapabilitiesForTools("slack", ["slack_send_message", "slack_search_channels"])).toEqual(["slack.post_message"]);
  });

  it("maps a curated capability and never exposes arbitrary provider tools", async () => {
    const calls: unknown[] = [];
    const gateway: RemoteMcpGateway = { async call(input) { calls.push(input); return { data: { ok: true }, externalReference: "mcp-call-1" }; } };
    const adapter = new RemoteMcpIntegrationAdapter(new MemoryRemoteMcpConnectionRepository([connection]), gateway);
    expect(await adapter.executeCapability("slack.post_message", { channelId: "C123", text: "Qualified lead" }, context)).toMatchObject({ ok: true, externalReference: "mcp-call-1" });
    expect(calls).toMatchObject([{ serverUrl: "https://mcp.slack.com/mcp", toolName: "slack_send_message", arguments: { channel_id: "C123", message: "Qualified lead" } }]);
    expect(await adapter.executeCapability("slack.delete_channel", {}, context)).toMatchObject({ ok: false, classification: "POLICY" });
  });

  it("fails closed across tenants and suppresses writes during dry-run", async () => {
    let calls = 0;
    const adapter = new RemoteMcpIntegrationAdapter(new MemoryRemoteMcpConnectionRepository([connection]), { async call() { calls++; return { data: {} }; } });
    expect(await adapter.getConnectionStatus({ organizationId: "org_2", provider: "slack", capabilityId: "slack.post_message" })).toMatchObject({ connected: false });
    expect(await adapter.executeCapability("slack.post_message", { channelId: "C123", text: "Qualified lead" }, { ...context, mode: "dry_run" })).toMatchObject({ ok: true, data: { dryRun: true } });
    expect(calls).toBe(0);
  });

  it("routes per capability and retains the managed OAuth fallback", async () => {
    const mcpCalls: string[] = [];
    const fallbackCalls: string[] = [];
    const mcp = new RemoteMcpIntegrationAdapter(new MemoryRemoteMcpConnectionRepository([connection]), { async call(input) { mcpCalls.push(input.toolName); return { data: {} }; } });
    const composioGateway: ComposioGateway = { async execute(slug) { fallbackCalls.push(slug); return { successful: true, data: {} }; }, async link() { return { id: "unused" }; } };
    const fallback = new ComposioIntegrationAdapter(new MemoryConnectionReferenceRepository([{ organizationId: "org_1", provider: "slack", connectedAccountId: "managed_1", status: "CONNECTED", displayName: "Managed Slack" }]), composioGateway);
    const routed = new RoutedIntegrationAdapter(mcp, fallback);
    await routed.executeCapability("slack.post_message", { channelId: "C123", text: "Qualified lead" }, context);
    await routed.executeCapability("slack.list_channels", { limit: 10 }, context);
    expect(mcpCalls).toEqual(["slack_send_message"]);
    expect(fallbackCalls).toEqual(["SLACK_LIST_ALL_CHANNELS"]);
  });
});
