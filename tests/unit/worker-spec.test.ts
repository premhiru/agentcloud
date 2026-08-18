import { describe, expect, it } from "vitest";

import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";
import { parseWorkerSpec, workerSpecSchema } from "@/domain/worker-spec";

describe("WorkerSpec 1.0", () => {
  it("validates the canonical worker", () => {
    const spec = parseWorkerSpec(inboundSalesWorkerSpec());
    expect(spec.schemaVersion).toBe("1.0");
    expect(spec.authority.defaultEffect).toBe("deny");
  });

  it("rejects unsupported schema versions", () => {
    expect(() => parseWorkerSpec({ ...inboundSalesWorkerSpec(), schemaVersion: "2.0" })).toThrow();
  });

  it("rejects unknown fields and secrets", () => {
    expect(workerSpecSchema.safeParse({ ...inboundSalesWorkerSpec(), access_token: "secret" }).success).toBe(false);
  });

  it("rejects authority for an ungranted capability", () => {
    const spec = inboundSalesWorkerSpec();
    expect(workerSpecSchema.safeParse({ ...spec, authority: { ...spec.authority, rules: [...spec.authority.rules, { capability: "unknown.tool", effect: "allow" }] } }).success).toBe(false);
  });

  it("rejects duplicate capability grants", () => {
    const spec = inboundSalesWorkerSpec();
    expect(workerSpecSchema.safeParse({ ...spec, capabilities: [...spec.capabilities, spec.capabilities[0]] }).success).toBe(false);
  });

  it("validates five-field schedules", () => {
    const spec = inboundSalesWorkerSpec();
    expect(workerSpecSchema.safeParse({ ...spec, triggers: [{ type: "schedule", cron: "bad", timezone: "UTC" }] }).success).toBe(false);
  });
});
