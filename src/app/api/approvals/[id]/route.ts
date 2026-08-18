import { NextResponse } from "next/server";
import { z } from "zod";

import { getControlPlane } from "@/application/control-plane";
import { requireTenantContext } from "@/lib/auth/tenant-context";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";

const schema = z.object({ decision: z.enum(["approve", "reject"]), comment: z.string().max(500).optional() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireTenantContext();
  try { await enforceRateLimit(context, "approvals:decide", 30); }
  catch (error) { if (error instanceof RateLimitExceededError) return NextResponse.json({ code: error.code }, { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } }); throw error; }
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ code: "VALIDATION_FAILED" }, { status: 400 });
  try { const approval = await (await getControlPlane()).decideApproval(context, (await params).id, parsed.data.decision, parsed.data.comment); return NextResponse.json({ approval }); }
  catch (error) { const code = error instanceof Error ? error.message : "UNKNOWN"; return NextResponse.json({ code }, { status: code === "APPROVAL_NOT_FOUND" ? 404 : 409 }); }
}
