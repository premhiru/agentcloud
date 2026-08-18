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

  it("creates a no-tool worker when no registry capability matches", async () => {
    const result = await compileWorker({ objective: "Think about quarterly planning and summarize the objective" }, new FakeCompilerModel());
    expect(result.spec.capabilities).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });
});
