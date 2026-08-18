import "server-only";

import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { connections, organizationMemberships, organizations, users } from "@/db/schema";
import type { IntegrationProvider } from "@/domain/tool-registry";
import type { TenantContext } from "@/lib/auth/tenant-context";
import { createComposioGateway, createConnectionLink, type ComposioGateway } from "./composio-adapter";

async function organizationId(context: TenantContext): Promise<string> {
  const [row] = await getDatabase().select({ id: organizations.id }).from(organizations)
    .innerJoin(organizationMemberships, eq(organizationMemberships.organizationId, organizations.id))
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(and(eq(organizations.clerkOrganizationId, context.organizationExternalId), eq(users.clerkUserId, context.userExternalId))).limit(1);
  if (!row) throw new Error("TENANT_ACCESS_DENIED"); return row.id;
}

export async function beginConnection(input: Readonly<{ context: TenantContext; provider: IntegrationProvider; origin: string; gateway?: ComposioGateway }>) {
  if (!URL.canParse(input.origin) || new URL(input.origin).protocol !== "https:" && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(input.origin)) throw new Error("APP_BASE_URL_INVALID");
  const state = crypto.randomUUID(); const gateway = input.gateway ?? createComposioGateway();
  const callbackUrl = `${input.origin}/api/integrations/callback?provider=${input.provider}&state=${state}`;
  const link = await createConnectionLink({ organizationId: input.context.organizationExternalId, provider: input.provider, callbackUrl, gateway });
  const orgId = await organizationId(input.context); const db = getDatabase();
  await db.insert(connections).values({ organizationId: orgId, provider: input.provider, externalConnectionId: link.connectionRequestId, displayName: `Pending ${input.provider}`, status: "ERROR", metadataJson: { state, pending: true } })
    .onConflictDoUpdate({ target: [connections.organizationId, connections.provider, connections.externalConnectionId], set: { status: "ERROR", metadataJson: { state, pending: true }, updatedAt: new Date() } });
  return link;
}

export async function completeConnection(input: Readonly<{ context: TenantContext; provider: IntegrationProvider; state: string; gateway?: ComposioGateway }>) {
  const orgId = await organizationId(input.context); const db = getDatabase();
  const rows = await db.select().from(connections).where(and(eq(connections.organizationId, orgId), eq(connections.provider, input.provider)));
  const pending = rows.find((row) => row.metadataJson.state === input.state && row.metadataJson.pending === true);
  if (!pending) throw new Error("CONNECTION_STATE_INVALID"); const gateway = input.gateway ?? createComposioGateway(); if (!gateway.get) throw new Error("COMPOSIO_CONNECTION_LOOKUP_UNAVAILABLE");
  const account = await gateway.get(pending.externalConnectionId); if (account.id !== pending.externalConnectionId || account.toolkit.slug.toLowerCase() !== input.provider || account.status !== "ACTIVE") throw new Error("CONNECTION_NOT_ACTIVE");
  const [updated] = await db.update(connections).set({ status: "CONNECTED", displayName: account.alias ?? `${input.provider} account`, metadataJson: {}, updatedAt: new Date() }).where(and(eq(connections.organizationId, orgId), eq(connections.id, pending.id))).returning();
  return updated;
}
