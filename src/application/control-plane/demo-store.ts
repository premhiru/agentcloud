import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { compileWorker, FakeCompilerModel } from "@/application/compiler/compiler";
import { hashActionRequest, hashWorkerSpec } from "@/domain/canonical-json";
import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";
import type { WorkerSpec } from "@/domain/worker-spec";
import type { TenantContext } from "@/lib/auth/tenant-context";

export type UiWorkerVersion = { id: string; versionNumber: number; spec: WorkerSpec; specHash: string; createdAt: string; deployedAt?: string };
export type UiRunStep = { sequence: number; type: string; status: string; summary: string; at: string };
export type UiRun = { id: string; organizationId: string; workerId: string; workerVersionId: string; mode: "dry_run" | "live"; triggerType: "manual" | "schedule" | "webhook"; status: string; createdAt: string; estimatedCostUsd: number; steps: UiRunStep[] };
export type UiWorker = { id: string; organizationId: string; name: string; status: "DRAFT" | "READY" | "DEPLOYED" | "PAUSED" | "ARCHIVED"; activeVersionId?: string; versions: UiWorkerVersion[]; createdAt: string; updatedAt: string };
export type UiApproval = { id: string; organizationId: string; workerId: string; runId: string; capabilityId: string; reason: string; preview: Record<string, unknown>; requestHash: string; status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "CANCELLED"; requestedAt: string; expiresAt: string; decidedAt?: string; comment?: string };

class DemoControlPlaneStore {
  private workers: UiWorker[] = [];
  private runs: UiRun[] = [];
  private approvals: UiApproval[] = [];
  private readonly dataPath = process.env.AGENTCLOUD_DEMO_DATA_PATH ?? resolve(process.cwd(), ".agentcloud", "demo-store.json");

  constructor() {
    const spec = inboundSalesWorkerSpec();
    const now = new Date().toISOString();
    const version: UiWorkerVersion = { id: "version_inbound_1", versionNumber: 1, spec, specHash: hashWorkerSpec(spec), createdAt: now };
    this.workers.push({ id: "worker_inbound_sales", organizationId: "org_demo", name: spec.identity.name, status: "READY", versions: [version], createdAt: now, updatedAt: now });
    if (!existsSync(this.dataPath)) this.save();
  }

  private load(): void {
    if (!existsSync(this.dataPath)) { this.save(); return; }
    const state = JSON.parse(readFileSync(this.dataPath, "utf8")) as { workers: UiWorker[]; runs: UiRun[]; approvals: UiApproval[] };
    this.workers = state.workers; this.runs = state.runs; this.approvals = state.approvals;
  }

  private save(): void {
    mkdirSync(dirname(this.dataPath), { recursive: true });
    writeFileSync(this.dataPath, JSON.stringify({ workers: this.workers, runs: this.runs, approvals: this.approvals }), "utf8");
  }

  listWorkers(context: TenantContext): UiWorker[] {
    this.load();
    return this.workers.filter((worker) => worker.organizationId === context.organizationExternalId).map((worker) => structuredClone(worker));
  }

  getWorker(context: TenantContext, workerId: string): UiWorker | undefined {
    this.load();
    const worker = this.workers.find((item) => item.id === workerId && item.organizationId === context.organizationExternalId);
    return worker ? structuredClone(worker) : undefined;
  }

  async createWorker(context: TenantContext, objective: string): Promise<UiWorker> {
    this.load();
    const compilation = await compileWorker({ objective, connectedIntegrations: ["gmail", "hubspot", "slack"] }, new FakeCompilerModel());
    const now = new Date().toISOString();
    const version: UiWorkerVersion = { id: randomUUID(), versionNumber: 1, spec: compilation.spec, specHash: hashWorkerSpec(compilation.spec), createdAt: now };
    const worker: UiWorker = { id: randomUUID(), organizationId: context.organizationExternalId, name: compilation.spec.identity.name, status: "READY", versions: [version], createdAt: now, updatedAt: now };
    this.workers.unshift(worker);
    this.save();
    return structuredClone(worker);
  }

  async createWorkerVersion(context: TenantContext, workerId: string, objective: string): Promise<UiWorker> {
    this.load();
    const worker = this.workers.find((item) => item.id === workerId && item.organizationId === context.organizationExternalId);
    if (!worker) throw new Error("WORKER_NOT_FOUND");
    if (worker.status === "ARCHIVED") throw new Error("WORKER_ARCHIVED");
    const compilation = await compileWorker({ objective, connectedIntegrations: ["gmail", "hubspot", "slack"] }, new FakeCompilerModel());
    const now = new Date().toISOString();
    worker.versions.push({
      id: randomUUID(),
      versionNumber: Math.max(...worker.versions.map((version) => version.versionNumber)) + 1,
      spec: compilation.spec,
      specHash: hashWorkerSpec(compilation.spec),
      createdAt: now,
    });
    worker.updatedAt = now;
    this.save();
    return structuredClone(worker);
  }

  transition(context: TenantContext, workerId: string, action: "deploy" | "pause" | "resume" | "archive" | "rollback", versionId?: string): UiWorker {
    this.load();
    const worker = this.workers.find((item) => item.id === workerId && item.organizationId === context.organizationExternalId);
    if (!worker) throw new Error("WORKER_NOT_FOUND");
    if (action === "deploy") {
      const version = worker.versions.at(-1)!;
      worker.status = "DEPLOYED"; worker.activeVersionId = version.id; version.deployedAt = new Date().toISOString();
    } else if (action === "pause" && worker.status === "DEPLOYED") worker.status = "PAUSED";
    else if (action === "resume" && worker.status === "PAUSED") worker.status = "DEPLOYED";
    else if (action === "archive") worker.status = "ARCHIVED";
    else if (action === "rollback" && versionId && worker.versions.some((version) => version.id === versionId)) { worker.activeVersionId = versionId; worker.status = "DEPLOYED"; }
    else throw new Error("INVALID_STATE_TRANSITION");
    worker.updatedAt = new Date().toISOString();
    this.save();
    return structuredClone(worker);
  }

  listRuns(context: TenantContext, workerId?: string): UiRun[] {
    this.load();
    return this.runs.filter((run) => run.organizationId === context.organizationExternalId && (!workerId || run.workerId === workerId)).map((run) => structuredClone(run));
  }

  getRun(context: TenantContext, runId: string): UiRun | undefined {
    this.load();
    const run = this.runs.find((item) => item.id === runId && item.organizationId === context.organizationExternalId);
    return run ? structuredClone(run) : undefined;
  }

  recordRun(context: TenantContext, run: UiRun): UiRun {
    this.load();
    if (run.organizationId !== context.organizationExternalId) throw new Error("TENANT_ACCESS_DENIED");
    const existing = this.runs.find((item) => item.id === run.id && item.organizationId === context.organizationExternalId);
    if (existing) return structuredClone(existing);
    this.runs.unshift(structuredClone(run)); this.save(); return structuredClone(run);
  }

  createPreviewRun(context: TenantContext, workerId: string): UiRun {
    this.load();
    const worker = this.workers.find((item) => item.id === workerId && item.organizationId === context.organizationExternalId);
    if (!worker) throw new Error("WORKER_NOT_FOUND");
    const version = worker.versions.find((item) => item.id === worker.activeVersionId) ?? worker.versions.at(-1)!;
    const at = new Date().toISOString();
    const run: UiRun = {
      id: randomUUID(), organizationId: context.organizationExternalId, workerId, workerVersionId: version.id,
      mode: "dry_run", triggerType: "manual", status: "SUCCEEDED", createdAt: at, estimatedCostUsd: 0.0042,
      steps: [
        { sequence: 1, type: "trigger", status: "SUCCEEDED", summary: "Received sample sales enquiry", at },
        { sequence: 2, type: "tool", status: "SUCCEEDED", summary: "Read Gmail enquiry from maya@northstar.example", at },
        { sequence: 3, type: "tool", status: "SUCCEEDED", summary: "Searched HubSpot for the sender", at },
        { sequence: 4, type: "dry_run", status: "SUCCEEDED", summary: "Would create or update the HubSpot contact", at },
        { sequence: 5, type: "dry_run", status: "SUCCEEDED", summary: "Would request approval to send an email response", at },
        { sequence: 6, type: "dry_run", status: "SUCCEEDED", summary: "Would post a qualified-lead summary to Slack", at },
      ],
    };
    this.runs.unshift(run);
    this.save();
    return structuredClone(run);
  }

  createLiveRun(context: TenantContext, workerId: string): UiRun {
    this.load();
    const worker = this.workers.find((item) => item.id === workerId && item.organizationId === context.organizationExternalId);
    if (!worker) throw new Error("WORKER_NOT_FOUND");
    if (worker.status !== "DEPLOYED" || !worker.activeVersionId) throw new Error("WORKER_NOT_DEPLOYED");
    const at = new Date().toISOString();
    const run: UiRun = {
      id: randomUUID(), organizationId: context.organizationExternalId, workerId, workerVersionId: worker.activeVersionId,
      mode: "live", triggerType: "manual", status: "WAITING_FOR_APPROVAL", createdAt: at, estimatedCostUsd: 0.0031,
      steps: [
        { sequence: 1, type: "trigger", status: "SUCCEEDED", summary: "Received inbound sales enquiry", at },
        { sequence: 2, type: "tool", status: "SUCCEEDED", summary: "Read Gmail enquiry from maya@northstar.example", at },
        { sequence: 3, type: "tool", status: "SUCCEEDED", summary: "Searched HubSpot for the sender", at },
        { sequence: 4, type: "tool", status: "SUCCEEDED", summary: "Upserted one HubSpot contact", at },
        { sequence: 5, type: "approval", status: "PENDING", summary: "Approval required before sending the external email", at },
      ],
    };
    const email = { to: "maya@northstar.example", subject: "Re: Product enquiry", body: "Thanks for reaching out. We would be glad to help." };
    const approval: UiApproval = {
      id: randomUUID(), organizationId: context.organizationExternalId, workerId, runId: run.id,
      capabilityId: "gmail.send_email", reason: "External email requires human approval", preview: email,
      requestHash: hashActionRequest(email), status: "PENDING", requestedAt: at,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    this.runs.unshift(run); this.approvals.unshift(approval); this.save();
    return structuredClone(run);
  }

  cancelRun(context: TenantContext, runId: string): UiRun {
    this.load();
    const run = this.runs.find((item) => item.id === runId && item.organizationId === context.organizationExternalId);
    if (!run) throw new Error("RUN_NOT_FOUND");
    if (!["QUEUED", "RUNNING", "WAITING_FOR_APPROVAL"].includes(run.status)) throw new Error("RUN_NOT_CANCELLABLE");
    const at = new Date().toISOString();
    run.status = "CANCELLED";
    run.steps.push({ sequence: run.steps.length + 1, type: "run", status: "CANCELLED", summary: "Run cancelled by an authorized user", at });
    for (const approval of this.approvals.filter((item) => item.runId === run.id && item.status === "PENDING")) approval.status = "CANCELLED";
    this.save();
    return structuredClone(run);
  }

  listApprovals(context: TenantContext): UiApproval[] {
    this.load();
    return this.approvals.filter((approval) => approval.organizationId === context.organizationExternalId).map((approval) => structuredClone(approval));
  }

  createApproval(context: TenantContext, input: Omit<UiApproval, "id" | "organizationId" | "status" | "requestedAt">): UiApproval {
    this.load(); const now = new Date().toISOString();
    const approval: UiApproval = { ...input, id: randomUUID(), organizationId: context.organizationExternalId, status: "PENDING", requestedAt: now };
    this.approvals.unshift(approval); this.save(); return structuredClone(approval);
  }

  decideApproval(context: TenantContext, approvalId: string, decision: "approve" | "reject", comment?: string): UiApproval {
    this.load(); const approval = this.approvals.find((item) => item.id === approvalId && item.organizationId === context.organizationExternalId);
    if (!approval) throw new Error("APPROVAL_NOT_FOUND"); if (approval.status !== "PENDING") throw new Error("APPROVAL_ALREADY_DECIDED");
    if (new Date(approval.expiresAt) <= new Date()) { approval.status = "EXPIRED"; this.save(); throw new Error("APPROVAL_EXPIRED"); }
    const decidedAt = new Date().toISOString();
    approval.status = decision === "approve" ? "APPROVED" : "REJECTED"; approval.decidedAt = decidedAt; approval.comment = comment;
    const run = this.runs.find((item) => item.id === approval.runId && item.organizationId === context.organizationExternalId);
    if (!run || run.status !== "WAITING_FOR_APPROVAL") throw new Error("RUN_NOT_WAITING_FOR_APPROVAL");
    const approvalStep = run.steps.find((step) => step.type === "approval" && step.status === "PENDING");
    if (approvalStep) { approvalStep.status = approval.status; approvalStep.summary = decision === "approve" ? "External email action approved" : "External email action rejected"; }
    if (decision === "approve") {
      run.steps.push(
        { sequence: run.steps.length + 1, type: "tool", status: "SUCCEEDED", summary: "Sent one approved Gmail response", at: decidedAt },
        { sequence: run.steps.length + 2, type: "tool", status: "SUCCEEDED", summary: "Posted qualified-lead summary to Slack", at: decidedAt },
      );
      run.status = "SUCCEEDED"; run.estimatedCostUsd = 0.0048;
    } else {
      run.steps.push({ sequence: run.steps.length + 1, type: "approval", status: "REJECTED", summary: "Run stopped because the action was rejected", at: decidedAt });
      run.status = "CANCELLED";
    }
    this.save(); return structuredClone(approval);
  }
}

const globalStore = globalThis as typeof globalThis & { __agentCloudDemoStore?: DemoControlPlaneStore };
export const demoControlPlane = globalStore.__agentCloudDemoStore ??= new DemoControlPlaneStore();
