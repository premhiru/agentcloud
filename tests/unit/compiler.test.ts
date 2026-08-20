import { describe, expect, it } from "vitest";

import { compileWorker, FakeCompilerModel, type CompilerModel } from "@/application/compiler/compiler";

describe("Worker Compiler", () => {
  it("compiles the canonical sales worker with safe defaults", async () => {
    const result = await compileWorker({ objective: "Make sure good inbound sales leads never fall through the cracks", connectedIntegrations: [] }, new FakeCompilerModel());
    expect(result.spec.identity.name).toBe("Inbound Sales Guardian");
    expect(result.spec.authority.defaultEffect).toBe("deny");
    expect(result.missingConnections.sort()).toEqual(["gmail", "hubspot", "slack"]);
    expect(result.spec.authority.rules.find((rule) => rule.capability === "gmail.send_email")?.effect).toBe("require_approval");
  });

  it("reports hallucinated capabilities instead of granting them", async () => {
    const model: CompilerModel = { async propose() { return { name: "Bad", description: "Bad proposal", instructions: ["Do work"], triggers: [{ type: "manual" }], capabilityIds: ["gmail.read_message", "stripe.refund"], authorityRules: [{ capability: "gmail.read_message", effect: "allow" }, { capability: "stripe.refund", effect: "allow" }], unsupportedCapabilities: [], warnings: [], questions: [] }; } };
    const result = await compileWorker({ objective: "Review incoming requests and refund them automatically" }, model);
    expect(result.unsupportedCapabilities).toEqual(["stripe.refund"]);
    expect(result.spec.capabilities).toEqual([{ capability: "gmail.read_message" }]);
    expect(result.spec.authority.rules).toHaveLength(1);
  });

  it("normalizes model-proposed authority with deterministic conservative defaults", async () => {
    const model: CompilerModel = { async propose() { return {
      name: "Authority test", description: "Tests deterministic authority", instructions: ["Work safely"], triggers: [{ type: "manual" }],
      capabilityIds: ["gmail.send_email", "gmail.read_message", "gmail.read_message", "slack.post_message"],
      authorityRules: [
        { capability: "gmail.send_email", effect: "allow" },
        { capability: "gmail.read_message", effect: "allow" },
        { capability: "gmail.read_message", effect: "deny" },
      ],
      unsupportedCapabilities: [], warnings: [], questions: [],
    }; } };
    const result = await compileWorker({ objective: "Handle external messages with conservative authority" }, model);
    expect(result.spec.capabilities).toEqual([
      { capability: "gmail.send_email" },
      { capability: "gmail.read_message" },
      { capability: "slack.post_message" },
    ]);
    expect(result.spec.authority.rules).toEqual([
      { capability: "gmail.send_email", effect: "require_approval" },
      { capability: "gmail.read_message", effect: "deny" },
      { capability: "slack.post_message", effect: "require_approval" },
    ]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("gmail.send_email is high risk"),
      expect.stringContaining("slack.post_message had no valid authority proposal"),
    ]));
  });

  it("creates a no-tool worker when no registry capability matches", async () => {
    const result = await compileWorker({ objective: "Think about quarterly planning and summarize the objective" }, new FakeCompilerModel());
    expect(result.spec.capabilities).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });
});
