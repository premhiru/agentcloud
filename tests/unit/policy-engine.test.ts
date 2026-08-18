import { describe, expect, it } from "vitest";

import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";
import { evaluatePolicy } from "@/domain/policy-engine";

const spec = inboundSalesWorkerSpec();

describe("Policy Engine", () => {
  it("allows explicitly allowed reads", () => {
    expect(evaluatePolicy({ spec, capabilityId: "gmail.read_message", input: { messageId: "msg_1" } })).toEqual({ decision: "allow" });
  });

  it("requires approval for email sends", () => {
    expect(evaluatePolicy({ spec, capabilityId: "gmail.send_email", input: { to: ["lead@example.com"], subject: "Hello", body: "Thanks for your enquiry" } }).decision).toBe("require_approval");
  });

  it("denies unknown capabilities", () => {
    expect(evaluatePolicy({ spec, capabilityId: "shell.exec", input: {} }).decision).toBe("deny");
  });

  it("denies registered but ungranted capabilities", () => {
    const reduced = { ...spec, capabilities: spec.capabilities.filter((grant) => grant.capability !== "slack.post_message") };
    expect(evaluatePolicy({ spec: reduced, capabilityId: "slack.post_message", input: { channelId: "C1", text: "Hi" } }).decision).toBe("deny");
  });

  it("denies malformed tool input before execution", () => {
    expect(evaluatePolicy({ spec, capabilityId: "gmail.send_email", input: { to: "not-an-array" } }).decision).toBe("deny");
  });

  it("enforces daily constraints", () => {
    expect(evaluatePolicy({ spec, capabilityId: "gmail.send_email", input: { to: ["lead@example.com"], subject: "Hi", body: "A complete body" }, executionsToday: 25 }).decision).toBe("deny");
  });

  it("uses default deny when a rule is absent", () => {
    const noRule = { ...spec, authority: { ...spec.authority, rules: spec.authority.rules.filter((rule) => rule.capability !== "hubspot.create_note") } };
    expect(evaluatePolicy({ spec: noRule, capabilityId: "hubspot.create_note", input: { contactId: "1", body: "Qualified enquiry" } }).decision).toBe("deny");
  });
});
