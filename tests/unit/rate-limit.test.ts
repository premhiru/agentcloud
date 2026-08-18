import { describe, expect, it } from "vitest";

import type { TenantContext } from "@/lib/auth/tenant-context";

describe("rate limiting", () => {
  it("rejects requests above the configured tenant/user/operation bucket", async () => {
    process.env.DEMO_MODE = "true"; const { enforceRateLimit, RateLimitExceededError } = await import("@/lib/rate-limit"); const context: TenantContext = { organizationExternalId: "org_rate", userExternalId: "user_rate", role: "owner", source: "demo" }; const operation = `test:${crypto.randomUUID()}`;
    await enforceRateLimit(context, operation, 2); await enforceRateLimit(context, operation, 2); await expect(enforceRateLimit(context, operation, 2)).rejects.toBeInstanceOf(RateLimitExceededError);
  });
});
