import { describe, expect, it } from "vitest";

import { ComposioIntegrationAdapter, MemoryConnectionReferenceRepository, composioToolMap, type ComposioGateway } from "@/integrations/composio-adapter";

const connected = { organizationId: "org_1", provider: "gmail" as const, connectedAccountId: "ca_gmail", status: "CONNECTED" as const, displayName: "Work Gmail" };
const context = { organizationId: "org_1", workerId: "worker_1", workerVersionId: "version_1", runId: "run_1", modelToolCallId: "call_1", mode: "live" as const };

function gateway(execute: ComposioGateway["execute"]): ComposioGateway { return { execute, async link() { return { id: "link_1", redirectUrl: "https://connect.example/secure" }; } }; }

describe("Composio integration adapter", () => {
  it("maps every curated capability and no destructive tool", () => {
    expect(Object.keys(composioToolMap)).toHaveLength(9);
    expect(Object.values(composioToolMap).some((slug) => /DELETE|ARCHIVE|REMOVE/.test(slug))).toBe(false);
  });

  it("passes only the opaque connected account reference and mapped arguments", async () => {
    const calls: unknown[] = []; const adapter = new ComposioIntegrationAdapter(new MemoryConnectionReferenceRepository([connected]), gateway(async (slug, body) => { calls.push({ slug, body }); return { successful: true, data: { messages: [] }, logId: "log_1" }; }));
    expect(await adapter.executeCapability("gmail.search_messages", { query: "is:unread", maxResults: 10 }, context)).toMatchObject({ ok: true, externalReference: "log_1" });
    expect(calls).toEqual([{ slug: "GMAIL_FETCH_EMAILS", body: { userId: "org_1", connectedAccountId: "ca_gmail", arguments: { query: "is:unread", max_results: 10, user_id: "me" } } }]);
  });

  it("fails closed for missing and cross-tenant connections", async () => {
    const adapter = new ComposioIntegrationAdapter(new MemoryConnectionReferenceRepository([connected]), gateway(async () => ({ successful: true, data: {} })));
    expect(await adapter.executeCapability("gmail.read_message", { messageId: "m1" }, { ...context, organizationId: "org_2" })).toMatchObject({ ok: false, classification: "AUTHENTICATION" });
  });

  it("never calls Composio for a dry-run write", async () => {
    let calls = 0; const adapter = new ComposioIntegrationAdapter(new MemoryConnectionReferenceRepository([connected]), gateway(async () => { calls++; return { successful: true }; }));
    expect(await adapter.executeCapability("gmail.send_email", { to: ["lead@example.com"], subject: "Hi", body: "Thanks for your enquiry" }, { ...context, mode: "dry_run" })).toMatchObject({ ok: true, data: { dryRun: true } });
    expect(calls).toBe(0);
  });

  it("marks an ambiguous write failure as unknown outcome", async () => {
    const adapter = new ComposioIntegrationAdapter(new MemoryConnectionReferenceRepository([connected]), gateway(async () => { throw new Error("network timeout after socket dispatch"); }));
    expect(await adapter.executeCapability("gmail.send_email", { to: ["lead@example.com"], subject: "Hi", body: "Thanks for your enquiry" }, context)).toMatchObject({ ok: false, classification: "UNKNOWN_OUTCOME" });
  });
});
