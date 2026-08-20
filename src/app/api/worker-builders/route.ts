import { NextResponse } from "next/server";
import { z } from "zod";

import { getBuilderApplication } from "@/application/builder";
import { builderErrorResponse } from "@/app/api/worker-builders/error-response";
import { getControlPlane } from "@/application/control-plane";
import { requireTenantContext } from "@/lib/auth/tenant-context";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";

const constraints = z.array(z.string().trim().min(1).max(500)).max(20).optional();
const startSchema = z.union([
  z.object({
    objective: z.string().trim().min(10).max(2_000),
    constraints,
  }).strict(),
  z.object({
    workerId: z.string().trim().min(1).max(128),
    constraints,
  }).strict(),
]);

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
    const existing = "workerId" in parsed.data
      ? await (await getControlPlane()).getWorker(context, parsed.data.workerId)
      : undefined;
    if ("workerId" in parsed.data && !existing) {
      return NextResponse.json({ code: "WORKER_NOT_FOUND" }, { status: 404 });
    }
    const baseVersion = existing?.versions.at(-1);
    const session = await application.service.start({
      organizationId: application.organizationId,
      userId: application.userId,
      objective: "objective" in parsed.data
        ? parsed.data.objective
        : baseVersion?.spec.objective ?? "",
      constraints: parsed.data.constraints,
      ...(existing && baseVersion ? {
        workerId: existing.id,
        baseWorkerVersionId: baseVersion.id,
        baseSpec: baseVersion.spec,
      } : {}),
    });
    return NextResponse.json(
      { session, builderPath: `/workers/build/${session.id}` },
      { status: 201 },
    );
  } catch (error) {
    return builderErrorResponse(error);
  }
}
