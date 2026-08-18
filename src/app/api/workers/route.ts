import { NextResponse } from "next/server";
import { z } from "zod";

import { demoControlPlane } from "@/application/control-plane/demo-store";
import { requireTenantContext } from "@/lib/auth/tenant-context";

const createSchema = z.object({ objective: z.string().trim().min(10).max(2_000) }).strict();

export async function GET() {
  const context = await requireTenantContext();
  return NextResponse.json({ workers: demoControlPlane.listWorkers(context) });
}

export async function POST(request: Request) {
  const context = await requireTenantContext();
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ code: "VALIDATION_FAILED", issues: parsed.error.issues }, { status: 400 });
  const worker = await demoControlPlane.createWorker(context, parsed.data.objective);
  return NextResponse.json({ worker }, { status: 201 });
}
