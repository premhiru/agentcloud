import { NextResponse } from "next/server";
import { z } from "zod";

import { beginConnection, getPreferredConnectionConfiguration } from "@/integrations/connection-service";
import { isDemoMode } from "@/lib/env";
import { requireTenantContext } from "@/lib/auth/tenant-context";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";

const providerSchema = z.enum(["gmail", "hubspot", "slack"]);
const bodySchema = z.object({ returnTo: z.string().max(1000).optional() }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const provider = providerSchema.safeParse((await params).provider); if (!provider.success) return NextResponse.json({ code: "VALIDATION_FAILED" }, { status: 400 });
  const context = await requireTenantContext();
  try { await enforceRateLimit(context, "connections:create", 10); }
  catch (error) { if (error instanceof RateLimitExceededError) return NextResponse.json({ code: error.code }, { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } }); throw error; }
  if (isDemoMode()) return NextResponse.json({ connected: true, provider: provider.data, displayName: `Demo ${provider.data}` });
  const configuration = getPreferredConnectionConfiguration(provider.data);
  if (!configuration.configured) return NextResponse.json({ code: "INTEGRATION_CONFIGURATION_REQUIRED", missing: configuration.missing }, { status: 503 });
  const body = await request.json().catch(() => ({})); const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ code: "VALIDATION_FAILED" }, { status: 400 });
  try { const link = await beginConnection({ context, provider: provider.data, origin: new URL(request.url).origin, returnTo: parsedBody.data.returnTo }); return NextResponse.json(link); }
  catch { return NextResponse.json({ code: "INTEGRATION_CONNECTION_FAILED" }, { status: 502 }); }
}
