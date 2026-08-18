import type { TenantContext } from "@/lib/auth/tenant-context";
import { isDemoMode } from "@/lib/env";

const demoBuckets = new Map<string, { count: number; windowStart: number }>();

export class RateLimitExceededError extends Error {
  readonly code = "RATE_LIMIT_EXCEEDED";
  constructor(readonly retryAfterSeconds: number) { super("RATE_LIMIT_EXCEEDED"); }
}

export async function enforceRateLimit(context: TenantContext, operation: string, limit: number, windowMs = 60_000): Promise<void> {
  const now = Date.now(); const windowStartMs = Math.floor(now / windowMs) * windowMs;
  if (isDemoMode()) {
    const key = `${context.organizationExternalId}:${context.userExternalId}:${operation}`;
    const current = demoBuckets.get(key);
    const next = !current || current.windowStart !== windowStartMs ? { count: 1, windowStart: windowStartMs } : { ...current, count: current.count + 1 };
    demoBuckets.set(key, next);
    if (next.count > limit) throw new RateLimitExceededError(Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1_000)));
    return;
  }

  const [{ eq, sql }, { getDatabase }, { organizations, rateLimitBuckets }] = await Promise.all([import("drizzle-orm"), import("@/db/client"), import("@/db/schema")]);
  const db = getDatabase();
  const [organization] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.clerkOrganizationId, context.organizationExternalId)).limit(1);
  if (!organization) throw new Error("TENANT_ACCESS_DENIED");
  const windowStart = new Date(windowStartMs);
  const [bucket] = await db.insert(rateLimitBuckets).values({ organizationId: organization.id, subject: context.userExternalId, operation, windowStart })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.organizationId, rateLimitBuckets.subject, rateLimitBuckets.operation, rateLimitBuckets.windowStart],
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    }).returning({ count: rateLimitBuckets.count });
  if (!bucket || bucket.count > limit) throw new RateLimitExceededError(Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1_000)));
}
