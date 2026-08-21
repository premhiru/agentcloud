import { NextResponse } from "next/server";
import { z } from "zod";

import { completeConnection } from "@/integrations/connection-service";
import { requireTenantContext } from "@/lib/auth/tenant-context";

const querySchema = z.object({ provider: z.enum(["gmail", "hubspot", "slack"]), state: z.string().uuid(), status: z.string().optional() }).passthrough();

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success || (parsed.data.status && parsed.data.status !== "success")) return NextResponse.redirect(new URL("/connections?error=connection_failed", request.url));
  try {
    const completed = await completeConnection({ context: await requireTenantContext(), provider: parsed.data.provider, state: parsed.data.state, callbackParams: new URL(request.url).searchParams, origin: new URL(request.url).origin });
    const destination = new URL(completed.returnTo, request.url); destination.searchParams.set("connected", parsed.data.provider); destination.hash = "readiness";
    return NextResponse.redirect(destination);
  }
  catch { return NextResponse.redirect(new URL("/connections?error=connection_not_active", request.url)); }
}
