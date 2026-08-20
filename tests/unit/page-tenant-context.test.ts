import { beforeEach, describe, expect, it, vi } from "vitest";

const doubles = vi.hoisted(() => {
  class MockOrganizationRequiredError extends Error {}

  return {
    MockOrganizationRequiredError,
    redirect: vi.fn((url: string): never => {
      throw new Error(`REDIRECT:${url}`);
    }),
    requireTenantContext: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: doubles.redirect }));
vi.mock("@/lib/auth/tenant-context", () => ({
  OrganizationRequiredError: doubles.MockOrganizationRequiredError,
  requireTenantContext: doubles.requireTenantContext,
}));

import { requirePageTenantContext } from "@/lib/auth/page-tenant-context";

describe("requirePageTenantContext", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an available tenant context unchanged", async () => {
    const context = {
      organizationExternalId: "org_1",
      userExternalId: "user_1",
      role: "owner",
      source: "clerk",
    } as const;
    doubles.requireTenantContext.mockResolvedValue(context);

    await expect(requirePageTenantContext()).resolves.toEqual(context);
    expect(doubles.redirect).not.toHaveBeenCalled();
  });

  it("redirects signed-in users without an organization to onboarding", async () => {
    doubles.requireTenantContext.mockRejectedValue(new doubles.MockOrganizationRequiredError());

    await expect(requirePageTenantContext()).rejects.toThrow("REDIRECT:/onboarding");
    expect(doubles.redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("does not mask unrelated tenant errors", async () => {
    const failure = new Error("database unavailable");
    doubles.requireTenantContext.mockRejectedValue(failure);

    await expect(requirePageTenantContext()).rejects.toBe(failure);
    expect(doubles.redirect).not.toHaveBeenCalled();
  });
});
