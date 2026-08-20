import "server-only";

import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { organizationMemberships, organizations, users } from "@/db/schema";
import type { TenantContext } from "./tenant-context";

export type TenantIds = Readonly<{ organizationId: string; userId: string }>;

export async function resolveTenantIds(context: TenantContext): Promise<TenantIds> {
  const [row] = await getDatabase()
    .select({ organizationId: organizations.id, userId: users.id, role: organizationMemberships.role })
    .from(organizations)
    .innerJoin(organizationMemberships, eq(organizationMemberships.organizationId, organizations.id))
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(and(
      eq(organizations.clerkOrganizationId, context.organizationExternalId),
      eq(users.clerkUserId, context.userExternalId),
    ))
    .limit(1);
  if (!row || row.role !== context.role) throw new Error("TENANT_ACCESS_DENIED");
  return row;
}
