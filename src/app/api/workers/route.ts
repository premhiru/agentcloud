import { NextResponse } from "next/server";
import { z } from "zod";

import { getControlPlane } from "@/application/control-plane";
import { requireTenantContext } from "@/lib/auth/tenant-context";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";

const createSchema = z.object({ objective: z.string().trim().min(10).max(2_000) }).strict();

export async function GET() {
  const context = await requireTenantContext();
  return NextResponse.json({ workers: await (await getControlPlane()).listWorkers(context) });
}

export async function POST(request: Request) {
  const context = await requireTenantContext();
  try { await enforceRateLimit(context, "workers:create", 20); }
  catch (error) { if (error instanceof RateLimitExceededError) return NextResponse.json({ code: error.code }, { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } }); throw error; }
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ code: "VALIDATION_FAILED", issues: parsed.error.issues }, { status: 400 });
  const worker = await (await getControlPlane()).createWorker(context, parsed.data.objective);
  return NextResponse.json({ worker }, { status: 201 });
}
