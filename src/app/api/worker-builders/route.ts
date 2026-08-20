import { NextResponse } from "next/server";
import { z } from "zod";

import { getBuilderApplication } from "@/application/builder";
import { builderErrorResponse } from "@/app/api/worker-builders/error-response";
import { requireTenantContext } from "@/lib/auth/tenant-context";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";

const startSchema = z.object({
  objective: z.string().trim().min(10).max(2_000),
  constraints: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
}).strict();

export async function POST(request: Request) {
  const context = await requireTenantContext();
  try {
    await enforceRateLimit(context, "worker-builders:start", 20);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        { code: error.code },
        { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } },
      );
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION_FAILED", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const application = await getBuilderApplication(context);
    const session = await application.service.start({
      organizationId: application.organizationId,
      userId: application.userId,
      objective: parsed.data.objective,
      constraints: parsed.data.constraints,
    });
    return NextResponse.json(
      { session, builderPath: `/workers/build/${session.id}` },
      { status: 201 },
    );
  } catch (error) {
    return builderErrorResponse(error);
  }
}
