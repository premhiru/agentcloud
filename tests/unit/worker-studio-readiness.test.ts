import { describe, expect, it } from "vitest";

import { deriveWorkerStudioReadiness } from "@/components/worker-studio-readiness";
import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";

describe("worker studio readiness", () => {
  it("derives required providers from the exact granted capabilities", () => {
    const spec = inboundSalesWorkerSpec();
    const readiness = deriveWorkerStudioReadiness(spec, "READY", [
      { provider: "gmail", status: "CONNECTED" },
      { provider: "hubspot", status: "CONNECTED" },
      { provider: "slack", status: "CONNECTED" },
    ]);

    expect(readiness.requiredProviders.map(({ provider }) => provider)).toEqual(["gmail", "hubspot", "slack"]);
    expect(readiness.requiredProviders.find(({ provider }) => provider === "gmail")?.capabilities).toEqual([
      "gmail.read_message",
      "gmail.search_messages",
      "gmail.send_email",
    ]);
    expect(readiness.approvalCount).toBe(1);
    expect(readiness.readyForDeploy).toBe(true);
  });

  it("fails closed when a required connection or explicit authority rule is missing", () => {
    const source = inboundSalesWorkerSpec();
    const spec = {
      ...source,
      authority: {
        ...source.authority,
        rules: source.authority.rules.filter((rule) => rule.capability !== "gmail.send_email"),
      },
    };
    const readiness = deriveWorkerStudioReadiness(spec, "READY", [
      { provider: "gmail", status: "EXPIRED" },
      { provider: "hubspot", status: "CONNECTED" },
      { provider: "slack", status: "CONNECTED" },
    ]);

    expect(readiness.readyForDeploy).toBe(false);
    expect(readiness.checks.find(({ id }) => id === "authority")?.status).toBe("blocked");
    expect(readiness.checks.find(({ id }) => id === "connections")?.detail).toContain("Gmail");
  });

  it("treats drafts as needing review and archived workers as blocked", () => {
    const spec = inboundSalesWorkerSpec();
    const connections = [
      { provider: "gmail", status: "CONNECTED" },
      { provider: "hubspot", status: "CONNECTED" },
      { provider: "slack", status: "CONNECTED" },
    ] as const;

    expect(deriveWorkerStudioReadiness(spec, "DRAFT", connections).checks.at(-1)?.status).toBe("warning");
    expect(deriveWorkerStudioReadiness(spec, "ARCHIVED", connections).checks.at(-1)?.status).toBe("blocked");
  });
});
