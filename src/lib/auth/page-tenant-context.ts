import "server-only";

import { redirect } from "next/navigation";

import {
  OrganizationRequiredError,
  requireTenantContext,
  type TenantContext,
} from "@/lib/auth/tenant-context";

export async function requirePageTenantContext(): Promise<TenantContext> {
  try {
    return await requireTenantContext();
  } catch (error) {
    if (error instanceof OrganizationRequiredError) redirect("/onboarding");
    throw error;
  }
}
