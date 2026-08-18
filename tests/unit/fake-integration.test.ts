import { describe, expect, it } from "vitest";

import { FakeIntegrationAdapter } from "@/integrations/fake-integration-adapter";

const context = { organizationId: "org_1", workerId: "worker_1", workerVersionId: "version_1", runId: "run_1", modelToolCallId: "call_1", mode: "dry_run" as const };

describe("fake integration adapter", () => {
  it("returns realistic deterministic reads", async () => {
    const adapter = new FakeIntegrationAdapter();
    const result = await adapter.executeCapability("gmail.search_messages", { query: "new lead", maxResults: 10 }, context);
    expect(result.ok && result.data.messages).toBeTruthy();
  });

  it("never performs writes in dry-run mode", async () => {
    const adapter = new FakeIntegrationAdapter();
    const result = await adapter.executeCapability("gmail.send_email", { to: ["lead@example.com"], subject: "Hello", body: "Thanks for your enquiry" }, context);
    expect(result).toMatchObject({ ok: true, data: { dryRun: true } });
    expect(adapter.writes).toHaveLength(0);
  });

  it("records live writes", async () => {
    const adapter = new FakeIntegrationAdapter();
    await adapter.executeCapability("slack.post_message", { channelId: "C1", text: "Qualified lead" }, { ...context, mode: "live" });
    expect(adapter.writes).toHaveLength(1);
  });

  it("fails closed for unknown capabilities and revoked connections", async () => {
    const adapter = new FakeIntegrationAdapter();
    expect(await adapter.executeCapability("unknown.tool", {}, context)).toMatchObject({ ok: false, classification: "POLICY" });
    adapter.setConnected("gmail", false);
    expect(await adapter.executeCapability("gmail.read_message", { messageId: "1" }, context)).toMatchObject({ ok: false, classification: "AUTHENTICATION" });
  });
});
