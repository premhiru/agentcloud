import { NextResponse } from "next/server";
import { z } from "zod";

import { demoControlPlane } from "@/application/control-plane/demo-store";
import { requireTenantContext } from "@/lib/auth/tenant-context";

const schema = z.object({ decision: z.enum(["approve", "reject"]), comment: z.string().max(500).optional() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireTenantContext(); const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ code: "VALIDATION_FAILED" }, { status: 400 });
  try { const approval = demoControlPlane.decideApproval(context, (await params).id, parsed.data.decision, parsed.data.comment); return NextResponse.json({ approval }); }
  catch (error) { const code = error instanceof Error ? error.message : "UNKNOWN"; return NextResponse.json({ code }, { status: code === "APPROVAL_NOT_FOUND" ? 404 : 409 }); }
}
