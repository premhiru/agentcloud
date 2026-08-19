import { eq } from "drizzle-orm";

import { closeDatabase, getDatabase } from "./client-core";
import { organizations, users, organizationMemberships } from "./schema";

const db = getDatabase();
const [organization] = await db
  .insert(organizations)
  .values({ clerkOrganizationId: "org_demo", name: "Northstar Demo", slug: "northstar-demo" })
  .onConflictDoUpdate({ target: organizations.clerkOrganizationId, set: { name: "Northstar Demo" } })
  .returning();
const [user] = await db
  .insert(users)
  .values({ clerkUserId: "user_demo", email: "demo@agentcloud.local", displayName: "Demo Owner" })
  .onConflictDoUpdate({ target: users.clerkUserId, set: { displayName: "Demo Owner" } })
  .returning();

if (!organization || !user) throw new Error("Failed to seed demo tenant");
await db
  .insert(organizationMemberships)
  .values({ organizationId: organization.id, userId: user.id, role: "owner" })
  .onConflictDoNothing();

const seeded = await db.query.organizations.findFirst({ where: eq(organizations.id, organization.id) });
console.info(`Seeded ${seeded?.name ?? "demo organization"}`);
await closeDatabase();
