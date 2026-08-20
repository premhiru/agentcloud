import { NextResponse } from "next/server";

import { getBuilderApplication } from "@/application/builder";
import { builderErrorResponse } from "@/app/api/worker-builders/error-response";
import { requireTenantContext } from "@/lib/auth/tenant-context";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireTenantContext();
  const { id } = await params;
  try {
    const application = await getBuilderApplication(context);
    const session = await application.service.get({
      organizationId: application.organizationId,
      sessionId: id,
    });
    if (!session) return NextResponse.json({ code: "BUILDER_SESSION_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ session });
  } catch (error) {
    return builderErrorResponse(error);
  }
}
