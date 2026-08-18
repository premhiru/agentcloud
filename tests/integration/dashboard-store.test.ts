import { describe, expect, it } from "vitest";

import { demoControlPlane } from "@/application/control-plane/demo-store";
import type { TenantContext } from "@/lib/auth/tenant-context";

const demo: TenantContext = { organizationExternalId: "org_demo", userExternalId: "user_demo", role: "owner", source: "demo" };
const other: TenantContext = { organizationExternalId: "org_security_test", userExternalId: "user_other", role: "owner", source: "demo" };

describe("tenant-scoped dashboard store", () => {
  it("never returns another tenant's workers", () => {
    expect(demoControlPlane.listWorkers(demo).length).toBeGreaterThan(0);
    expect(demoControlPlane.getWorker(other, "worker_inbound_sales")).toBeUndefined();
  });

  it("creates a compiled draft inside the authenticated tenant", async () => {
    const worker = await demoControlPlane.createWorker(other, "Make sure inbound sales enquiries are always handled promptly");
    expect(worker.organizationId).toBe(other.organizationExternalId);
    expect(demoControlPlane.getWorker(demo, worker.id)).toBeUndefined();
  });

  it("creates an inspectable dry-run timeline", () => {
    const run = demoControlPlane.createPreviewRun(demo, "worker_inbound_sales");
    expect(run.mode).toBe("dry_run");
    expect(run.steps.some((step) => step.summary.includes("Would"))).toBe(true);
    expect(demoControlPlane.getRun(other, run.id)).toBeUndefined();
  });
});
