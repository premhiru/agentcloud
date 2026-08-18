import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { compileWorker, FakeCompilerModel } from "@/application/compiler/compiler";
import { hashWorkerSpec } from "@/domain/canonical-json";
import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";
import type { WorkerSpec } from "@/domain/worker-spec";
import type { TenantContext } from "@/lib/auth/tenant-context";

export type UiWorkerVersion = { id: string; versionNumber: number; spec: WorkerSpec; specHash: string; createdAt: string; deployedAt?: string };
export type UiRunStep = { sequence: number; type: string; status: string; summary: string; at: string };
export type UiRun = { id: string; organizationId: string; workerId: string; workerVersionId: string; mode: "dry_run" | "live"; triggerType: "manual" | "schedule" | "webhook"; status: string; createdAt: string; estimatedCostUsd: number; steps: UiRunStep[] };
export type UiWorker = { id: string; organizationId: string; name: string; status: "DRAFT" | "READY" | "DEPLOYED" | "PAUSED" | "ARCHIVED"; activeVersionId?: string; versions: UiWorkerVersion[]; createdAt: string; updatedAt: string };
export type UiApproval = { id: string; organizationId: string; workerId: string; runId: string; capabilityId: string; reason: string; preview: Record<string, unknown>; status: "PENDING" | "APPROVED" | "REJECTED"; requestedAt: string };

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

  listApprovals(context: TenantContext): UiApproval[] {
    this.load();
    return this.approvals.filter((approval) => approval.organizationId === context.organizationExternalId).map((approval) => structuredClone(approval));
  }
}

const globalStore = globalThis as typeof globalThis & { __agentCloudDemoStore?: DemoControlPlaneStore };
export const demoControlPlane = globalStore.__agentCloudDemoStore ??= new DemoControlPlaneStore();
