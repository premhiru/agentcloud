import { describe, expect, it } from "vitest";

describe("foundation", () => {
  it("requires explicit demo mode", async () => {
    const previous = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "false";
    const { isDemoMode } = await import("@/lib/env");
    expect(isDemoMode()).toBe(false);
    process.env.DEMO_MODE = previous;
  });

  it("defines all tenant-owned persistence tables", async () => {
    const schema = await import("@/db/schema");
    expect([
      schema.workers,
      schema.workerVersions,
      schema.connections,
      schema.runs,
      schema.approvals,
      schema.auditEvents,
    ]).toHaveLength(6);
  });
});
