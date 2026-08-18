import { describe, expect, it } from "vitest";

import { getCapability, listCapabilities, validateRegisteredCapabilities } from "@/domain/tool-registry";

describe("curated tool registry", () => {
  it("exposes only the nine safe MVP capabilities", () => {
    const capabilities = listCapabilities();
    expect(capabilities).toHaveLength(9);
    expect(capabilities.some((item) => item.id.includes("delete"))).toBe(false);
  });

  it("marks external communication and dry-run support", () => {
    expect(getCapability("gmail.send_email")).toMatchObject({ effect: "external_communication", risk: "high", supportsDryRun: true });
  });

  it("does not invent unsupported tools", () => {
    expect(validateRegisteredCapabilities(["gmail.read_message", "stripe.refund"])).toEqual({ supported: ["gmail.read_message"], unsupported: ["stripe.refund"] });
  });

  it("rejects dangerous extra inputs", () => {
    const capability = getCapability("gmail.send_email")!;
    expect(capability.inputSchema.safeParse({ to: ["a@example.com"], subject: "Hi", body: "Hello", authorization: "secret" }).success).toBe(false);
  });
});
