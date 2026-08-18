import { NextResponse } from "next/server";
import { z } from "zod";

import { demoControlPlane } from "@/application/control-plane/demo-store";
import { requireTenantContext } from "@/lib/auth/tenant-context";

const actionSchema = z.object({ action: z.enum(["deploy", "pause", "resume", "archive", "rollback", "test", "trigger"]), versionId: z.string().uuid().or(z.string().startsWith("version_")).optional() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireTenantContext();
  const { id } = await params;
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ code: "VALIDATION_FAILED" }, { status: 400 });
  try {
    if (parsed.data.action === "test") return NextResponse.json({ run: await demoControlPlane.createPreviewRun(context, id) });
    if (parsed.data.action === "trigger") return NextResponse.json({ run: await demoControlPlane.createLiveRun(context, id) });
    return NextResponse.json({ worker: demoControlPlane.transition(context, id, parsed.data.action, parsed.data.versionId) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ code }, { status: code === "WORKER_NOT_FOUND" ? 404 : 409 });
  }
}
