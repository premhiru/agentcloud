import "server-only";

import { auth } from "@clerk/nextjs/server";

import { isDemoMode } from "@/lib/env";

export { isDemoMode } from "@/lib/env";

export type TenantRole = "owner" | "member";

export type TenantContext = Readonly<{
  organizationExternalId: string;
  userExternalId: string;
  role: TenantRole;
  source: "clerk" | "demo" | "mcp";
}>;

export class AuthenticationRequiredError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED";
}

export class OrganizationRequiredError extends Error {
  readonly code = "ORGANIZATION_REQUIRED";
}

export async function requireTenantContext(): Promise<TenantContext> {
  if (isDemoMode()) {
    return {
      organizationExternalId: process.env.DEMO_ORGANIZATION_ID ?? "org_demo",
      userExternalId: process.env.DEMO_USER_ID ?? "user_demo",
      role: "owner",
      source: "demo",
    };
  }

  const session = await auth();
  if (!session.userId) throw new AuthenticationRequiredError("Sign in is required");
  if (!session.orgId) throw new OrganizationRequiredError("Choose or create an organization");

  const role = session.orgRole === "org:admin" ? "owner" : "member";
  return {
    organizationExternalId: session.orgId,
    userExternalId: session.userId,
    role,
    source: "clerk",
  };
}

export function requireOwner(context: TenantContext): void {
  if (context.role !== "owner") {
    throw new Error("OWNER_ROLE_REQUIRED");
  }
}
