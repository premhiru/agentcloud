import { NextResponse } from "next/server";
import { z } from "zod";

import { completeConnection } from "@/integrations/connection-service";
import { requireTenantContext } from "@/lib/auth/tenant-context";

const querySchema = z.object({ provider: z.enum(["gmail", "hubspot", "slack"]), state: z.string().uuid(), status: z.string().optional() });

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success || (parsed.data.status && parsed.data.status !== "success")) return NextResponse.redirect(new URL("/integrations?error=connection_failed", request.url));
  try { await completeConnection({ context: await requireTenantContext(), provider: parsed.data.provider, state: parsed.data.state }); return NextResponse.redirect(new URL(`/integrations?connected=${parsed.data.provider}`, request.url)); }
  catch { return NextResponse.redirect(new URL("/integrations?error=connection_not_active", request.url)); }
}
