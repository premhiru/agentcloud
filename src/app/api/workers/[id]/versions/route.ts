import { NextResponse } from "next/server";
import { z } from "zod";

import { getControlPlane } from "@/application/control-plane";
import { requireTenantContext } from "@/lib/auth/tenant-context";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";

const versionSchema = z.object({ objective: z.string().trim().min(10).max(2_000) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireTenantContext();
  try { await enforceRateLimit(context, "workers:version", 20); }
  catch (error) {
    if (error instanceof RateLimitExceededError) return NextResponse.json({ code: error.code }, { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } });
    throw error;
  }
  const parsed = versionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ code: "VALIDATION_FAILED", issues: parsed.error.issues }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json({ worker: await (await getControlPlane()).createWorkerVersion(context, id, parsed.data.objective) }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ code }, { status: code === "WORKER_NOT_FOUND" ? 404 : 409 });
  }
}
