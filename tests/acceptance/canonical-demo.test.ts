import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import type { TenantContext } from "@/lib/auth/tenant-context";

let controlPlane: typeof import("@/application/control-plane/demo-store").demoControlPlane;

const tenant: TenantContext = { organizationExternalId: `org_acceptance_${randomUUID()}`, userExternalId: "user_acceptance", role: "owner", source: "demo" };

beforeAll(async () => {
  process.env.AGENTCLOUD_DEMO_DATA_PATH = resolve(process.cwd(), ".agentcloud", `acceptance-${randomUUID()}.json`);
  ({ demoControlPlane: controlPlane } = await import("@/application/control-plane/demo-store"));
});

describe("canonical Inbound Sales Worker", () => {
  it("uses the governed runner for dry-run, approval pause, exact resume, and final timeline", async () => {
    const worker = await controlPlane.createWorker(tenant, "Qualify inbound sales enquiries, update CRM, and follow up safely");

    const dryRun = await controlPlane.createPreviewRun(tenant, worker.id);
    expect(dryRun.status).toBe("SUCCEEDED");
    expect(dryRun.mode).toBe("dry_run");
    expect(dryRun.steps.filter((step) => step.type === "dry_run").map((step) => step.summary)).toEqual([
      "Would update the hubspot contact",
      "Would send the prepared email response",
      "Would post the qualified lead summary to slack",
    ]);

    const deployed = controlPlane.transition(tenant, worker.id, "deploy");
    expect(deployed.status).toBe("DEPLOYED");
    const waiting = await controlPlane.createLiveRun(tenant, worker.id);
    expect(waiting.status).toBe("WAITING_FOR_APPROVAL");
    expect(waiting.steps.map((step) => step.summary)).toEqual([
      "manual trigger received",
      "Search Gmail for new enquiries",
      "Read the sales enquiry",
      "Search HubSpot for the sender",
      "Update the HubSpot contact",
      "Send the prepared email response",
    ]);

    const approval = controlPlane.listApprovals(tenant).find((item) => item.runId === waiting.id)!;
    expect(approval.capabilityId).toBe("gmail.send_email");
    expect(approval.status).toBe("PENDING");
    await controlPlane.decideApproval(tenant, approval.id, "approve", "Qualified lead reviewed");

    const completed = controlPlane.getRun(tenant, waiting.id)!;
    expect(completed.status).toBe("SUCCEEDED");
    expect(completed.steps.map((step) => step.summary)).toEqual([
      "manual trigger received",
      "Search Gmail for new enquiries",
      "Read the sales enquiry",
      "Search HubSpot for the sender",
      "Update the HubSpot contact",
      "External email action approved",
      "Sent one approved Gmail response",
      "Post the qualified lead summary to Slack",
      "Inbound sales enquiry processed and recorded.",
    ]);
    expect(completed.steps.filter((step) => step.summary === "Update the HubSpot contact")).toHaveLength(1);
    expect(completed.steps.filter((step) => step.summary === "Sent one approved Gmail response")).toHaveLength(1);
    expect(completed.steps.filter((step) => step.summary === "Post the qualified lead summary to Slack")).toHaveLength(1);

    await expect(controlPlane.decideApproval(tenant, approval.id, "approve")).rejects.toThrow("APPROVAL_ALREADY_DECIDED");
    expect(controlPlane.getRun(tenant, waiting.id)!.steps.filter((step) => step.summary === "Sent one approved Gmail response")).toHaveLength(1);
  });
});
