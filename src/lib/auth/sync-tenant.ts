import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import { getDatabase } from "@/db/client";
import { organizationMemberships, organizations, users } from "@/db/schema";
import type { TenantRole } from "./tenant-context";

export async function syncTenantMembership(input: Readonly<{ clerkOrganizationId: string; clerkUserId: string; role: TenantRole }>): Promise<void> {
  const clerk = await clerkClient();
  const [organization, user] = await Promise.all([clerk.organizations.getOrganization({ organizationId: input.clerkOrganizationId }), clerk.users.getUser(input.clerkUserId)]);
  const email = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  if (!email) throw new Error("CLERK_USER_EMAIL_REQUIRED");
  const db = getDatabase();
  const [organizationRow] = await db.insert(organizations).values({ clerkOrganizationId: organization.id, name: organization.name, slug: organization.slug ?? organization.id.toLowerCase() }).onConflictDoUpdate({ target: organizations.clerkOrganizationId, set: { name: organization.name, updatedAt: new Date() } }).returning();
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  const [userRow] = await db.insert(users).values({ clerkUserId: user.id, email, displayName }).onConflictDoUpdate({ target: users.clerkUserId, set: { email, displayName, updatedAt: new Date() } }).returning();
  if (!organizationRow || !userRow) throw new Error("TENANT_SYNC_FAILED");
  await db.insert(organizationMemberships).values({ organizationId: organizationRow.id, userId: userRow.id, role: input.role }).onConflictDoUpdate({ target: [organizationMemberships.organizationId, organizationMemberships.userId], set: { role: input.role } });
}
