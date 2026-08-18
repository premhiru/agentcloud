import { NextResponse } from "next/server";
import { z } from "zod";

import { getControlPlane } from "@/application/control-plane";
import { requireTenantContext } from "@/lib/auth/tenant-context";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";

const actionSchema = z.object({ action: z.enum(["deploy", "pause", "resume", "archive", "rollback", "test", "trigger"]), versionId: z.string().uuid().or(z.string().startsWith("version_")).optional() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireTenantContext();
  try { await enforceRateLimit(context, "workers:action", 30); }
  catch (error) { if (error instanceof RateLimitExceededError) return NextResponse.json({ code: error.code }, { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } }); throw error; }
  const { id } = await params;
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ code: "VALIDATION_FAILED" }, { status: 400 });
  try {
    const controlPlane = await getControlPlane();
    if (parsed.data.action === "test") return NextResponse.json({ run: await controlPlane.createPreviewRun(context, id) });
    if (parsed.data.action === "trigger") return NextResponse.json({ run: await controlPlane.createLiveRun(context, id) });
    return NextResponse.json({ worker: await controlPlane.transition(context, id, parsed.data.action, parsed.data.versionId) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ code }, { status: code === "WORKER_NOT_FOUND" ? 404 : 409 });
  }
}
