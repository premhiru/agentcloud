import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { hashCanonical } from "@/domain/canonical-json";
import { getDatabase } from "@/db/client";
import { auditEvents, organizations, runs, webhookEvents, workerTriggers, workers } from "@/db/schema";
import { isDemoMode } from "@/lib/env";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import { redactSecrets } from "@/lib/redaction";
import { TriggerDevRuntime } from "@/runtime/trigger-dev-runtime";
import { MAX_WEBHOOK_BYTES, parseWebhookBody, verifyWebhookSignature } from "@/runtime/webhook-security";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; key: string }> }) {
  if (isDemoMode()) return NextResponse.json({ code: "WEBHOOKS_REQUIRE_PRODUCTION_PERSISTENCE" }, { status: 503 });
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_WEBHOOK_BYTES) return NextResponse.json({ code: "WEBHOOK_PAYLOAD_TOO_LARGE" }, { status: 413 });
  const rawBody = await request.text();
  if (!verifyWebhookSignature(rawBody, request.headers.get("x-agentcloud-signature"), process.env.WEBHOOK_SIGNING_SECRET)) return NextResponse.json({ code: "WEBHOOK_SIGNATURE_INVALID" }, { status: 401 });
  let payload: Record<string, unknown>;
  try { payload = parseWebhookBody(rawBody); }
  catch (error) { const code = error instanceof Error ? error.message : "WEBHOOK_PAYLOAD_INVALID"; return NextResponse.json({ code }, { status: code === "WEBHOOK_PAYLOAD_TOO_LARGE" ? 413 : 400 }); }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) return NextResponse.json({ code: "WEBHOOK_IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });

  const { id: workerId, key } = await params; const db = getDatabase();
  const candidates = await db.select().from(workerTriggers).where(and(eq(workerTriggers.workerId, workerId), eq(workerTriggers.type, "webhook"), eq(workerTriggers.enabled, true)));
  const trigger = candidates.find((item) => item.configJson.key === key);
  if (!trigger) return NextResponse.json({ code: "WEBHOOK_NOT_FOUND" }, { status: 404 });
  const [[worker], [organization]] = await Promise.all([
    db.select().from(workers).where(and(eq(workers.organizationId, trigger.organizationId), eq(workers.id, workerId))).limit(1),
    db.select({ externalId: organizations.clerkOrganizationId }).from(organizations).where(eq(organizations.id, trigger.organizationId)).limit(1),
  ]);
  if (!worker || worker.status !== "DEPLOYED" || worker.activeVersionId !== trigger.workerVersionId || !organization) return NextResponse.json({ code: "WORKER_NOT_DEPLOYED" }, { status: 409 });
  try { await enforceRateLimit({ organizationExternalId: organization.externalId, userExternalId: `webhook:${trigger.id}`, role: "member", source: "mcp" }, "webhook:receive", 120); }
  catch (error) { if (error instanceof RateLimitExceededError) return NextResponse.json({ code: error.code }, { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } }); throw error; }

  const payloadHash = hashCanonical(payload); const safePayload = redactSecrets(payload) as Record<string, unknown>;
  const claimed = await db.transaction(async (tx) => {
    const [event] = await tx.insert(webhookEvents).values({ organizationId: trigger.organizationId, workerId, triggerId: trigger.id, idempotencyKey, payloadJson: { payloadHash, payload: safePayload } }).onConflictDoNothing().returning();
    if (!event) {
      const [existing] = await tx.select().from(webhookEvents).where(and(eq(webhookEvents.triggerId, trigger.id), eq(webhookEvents.idempotencyKey, idempotencyKey))).limit(1);
      if (!existing || existing.payloadJson.payloadHash !== payloadHash) throw new Error("WEBHOOK_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD");
      return { duplicate: true, runId: existing.runId };
    }
    const [run] = await tx.insert(runs).values({ organizationId: trigger.organizationId, workerId, workerVersionId: trigger.workerVersionId, runtimeProvider: "trigger.dev", correlationId: `webhook:${trigger.id}:${idempotencyKey}`, mode: "live", triggerType: "webhook", triggerPayload: safePayload, status: "QUEUED" }).returning();
    if (!run) throw new Error("RUN_CREATE_FAILED");
    await tx.update(webhookEvents).set({ runId: run.id }).where(eq(webhookEvents.id, event.id));
    await tx.insert(auditEvents).values({ organizationId: trigger.organizationId, actorType: "system", actorId: trigger.id, action: "webhook.received", targetType: "run", targetId: run.id, metadataJson: { workerId, triggerId: trigger.id } });
    return { duplicate: false, runId: run.id };
  });
  if (!claimed.runId) return NextResponse.json({ code: "WEBHOOK_EVENT_INCOMPLETE" }, { status: 409 });
  if (claimed.duplicate) return NextResponse.json({ runId: claimed.runId, duplicate: true });
  try {
    const handle = await new TriggerDevRuntime().triggerRun({ organizationId: trigger.organizationId, workerId, workerVersionId: trigger.workerVersionId, runId: claimed.runId, mode: "live", trigger: { type: "webhook", payload: safePayload } });
    await db.update(runs).set({ runtimeRunId: handle.runtimeRunId, updatedAt: new Date() }).where(and(eq(runs.organizationId, trigger.organizationId), eq(runs.id, claimed.runId)));
    return NextResponse.json({ runId: claimed.runId, status: handle.status, duplicate: false }, { status: 202 });
  } catch {
    await db.update(runs).set({ status: "FAILED", errorCode: "RUNTIME_TRIGGER_FAILED", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(runs.organizationId, trigger.organizationId), eq(runs.id, claimed.runId)));
    return NextResponse.json({ code: "RUNTIME_TRIGGER_FAILED", runId: claimed.runId }, { status: 503 });
  }
}
