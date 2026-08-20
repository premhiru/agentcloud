import { NextResponse } from "next/server";
import { z } from "zod";

import { getBuilderApplication } from "@/application/builder";
import { builderErrorResponse } from "@/app/api/worker-builders/error-response";
import { requireTenantContext } from "@/lib/auth/tenant-context";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";

const abandonSchema = z.object({ expectedRevision: z.number().int().min(1) }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireTenantContext();
  try {
    await enforceRateLimit(context, "worker-builders:abandon", 20);
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
  const parsed = abandonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION_FAILED", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const application = await getBuilderApplication(context);
    const session = await application.service.abandon({
      organizationId: application.organizationId,
      sessionId: id,
      expectedRevision: parsed.data.expectedRevision,
    });
    return NextResponse.json({ session });
  } catch (error) {
    return builderErrorResponse(error);
  }
}
