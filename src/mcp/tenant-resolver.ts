import { asc, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { organizationMemberships, organizations, users } from "@/db/schema";
import type { TenantRole } from "@/lib/auth/tenant-context";

export type ResolvedMcpMembership = {
  organizationExternalId: string;
  role: TenantRole;
};

/**
 * OAuth access tokens identify the Clerk user, not an organization selected by
 * an untrusted tool argument. Resolve the user's deterministic default from
 * AgentCloud's own membership table instead.
 */
export async function resolveMcpMembership(clerkUserId: string): Promise<ResolvedMcpMembership | undefined> {
  const db = getDatabase();
  const [membership] = await db
    .select({ organizationExternalId: organizations.clerkOrganizationId, role: organizationMemberships.role })
    .from(users)
    .innerJoin(organizationMemberships, eq(organizationMemberships.userId, users.id))
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(eq(users.clerkUserId, clerkUserId))
    .orderBy(asc(organizationMemberships.createdAt))
    .limit(1);

  return membership;
}
