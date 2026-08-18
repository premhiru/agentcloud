import { NextResponse } from "next/server";
import { z } from "zod";

import { createConnectionLink } from "@/integrations/composio-adapter";
import { isDemoMode } from "@/lib/env";
import { requireTenantContext } from "@/lib/auth/tenant-context";

const providerSchema = z.enum(["gmail", "hubspot", "slack"]);
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const provider = providerSchema.safeParse((await params).provider); if (!provider.success) return NextResponse.json({ code: "VALIDATION_FAILED" }, { status: 400 });
  const context = await requireTenantContext(); if (isDemoMode()) return NextResponse.json({ connected: true, provider: provider.data, displayName: `Demo ${provider.data}` });
  try { const link = await createConnectionLink({ organizationId: context.organizationExternalId, provider: provider.data, callbackUrl: `${new URL(request.url).origin}/integrations?connected=${provider.data}` }); return NextResponse.json(link); }
  catch { return NextResponse.json({ code: "INTEGRATION_CONFIGURATION_REQUIRED" }, { status: 503 }); }
}
