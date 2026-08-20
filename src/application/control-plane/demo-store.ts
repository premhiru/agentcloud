import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { compileWorker, FakeCompilerModel } from "@/application/compiler/compiler";
import { hashActionRequest, hashWorkerSpec } from "@/domain/canonical-json";
import { inboundSalesWorkerSpec } from "@/domain/inbound-sales-worker";
import type { WorkerSpec } from "@/domain/worker-spec";
import { FakeIntegrationAdapter } from "@/integrations/fake-integration-adapter";
import type { TenantContext } from "@/lib/auth/tenant-context";
import { fakeInboundSalesEmailAction, FakeInboundSalesModel } from "@/runtime/fake-worker-model";
import { MemoryToolExecutionRepository, type ToolExecutionRecord } from "@/runtime/tool-executor";
import { MemoryRunnerJournal, resumeWorkerFromCheckpoint, runWorker, type RunnerCheckpoint, type RunnerStep } from "@/runtime/worker-runner";
import type { RunWorkerPayload } from "@/runtime/types";

const transientFileCodes = new Set(["EACCES", "EBUSY", "EPERM"]);
const renameRetryDelaysMs = [10, 25, 50, 100, 200, 400, 800] as const;
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

function renameDemoState(source: string, destination: string): void {
  for (const [attempt, delayMs] of renameRetryDelaysMs.entries()) {
    try {
      renameSync(source, destination);
      return;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (!transientFileCodes.has(code) || attempt === renameRetryDelaysMs.length - 1) throw error;
      Atomics.wait(sleepBuffer, 0, 0, delayMs);
    }
  }
}

export type UiWorkerVersion = { id: string; versionNumber: number; spec: WorkerSpec; specHash: string; createdAt: string; deployedAt?: string };
export type UiRunStep = { sequence: number; type: string; status: string; summary: string; at: string };
export type UiRun = { id: string; organizationId: string; workerId: string; workerVersionId: string; mode: "dry_run" | "live"; triggerType: "manual" | "schedule" | "webhook"; status: string; createdAt: string; estimatedCostUsd: number; steps: UiRunStep[] };
export type UiWorker = { id: string; organizationId: string; name: string; status: "DRAFT" | "READY" | "DEPLOYED" | "PAUSED" | "ARCHIVED"; activeVersionId?: string; versions: UiWorkerVersion[]; createdAt: string; updatedAt: string };
export type UiApproval = { id: string; organizationId: string; workerId: string; runId: string; capabilityId: string; reason: string; preview: Record<string, unknown>; requestHash: string; status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "CANCELLED"; requestedAt: string; expiresAt: string; decidedAt?: string; comment?: string };
export type UiAuditEvent = { id: string; organizationId: string; actorType: "user" | "worker" | "system" | "mcp"; actorId: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown>; createdAt: string };
export type UiConnection = { provider: "gmail" | "hubspot" | "slack"; status: "CONNECTED" | "EXPIRED" | "REVOKED" | "ERROR"; displayName: string };
type DemoContinuation = { runId: string; checkpoint: RunnerCheckpoint; executions: ToolExecutionRecord[] };

function uiSteps(steps: readonly RunnerStep[], at: string): UiRunStep[] {
  return steps.map((step) => ({ sequence: step.sequence, type: step.type, status: step.status, summary: step.summary, at }));
}

class DemoControlPlaneStore {
  private workers: UiWorker[] = [];
  private runs: UiRun[] = [];
  private approvals: UiApproval[] = [];
  private continuations: DemoContinuation[] = [];
  private auditEvents: UiAuditEvent[] = [];
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
    const state = JSON.parse(readFileSync(this.dataPath, "utf8")) as { workers: UiWorker[]; runs: UiRun[]; approvals: UiApproval[]; continuations?: DemoContinuation[]; auditEvents?: UiAuditEvent[] };
    this.workers = state.workers; this.runs = state.runs; this.approvals = state.approvals; this.continuations = state.continuations ?? []; this.auditEvents = state.auditEvents ?? [];
  }

  private save(): void {
    mkdirSync(dirname(this.dataPath), { recursive: true });
    const temporaryPath = `${this.dataPath}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify({ workers: this.workers, runs: this.runs, approvals: this.approvals, continuations: this.continuations, auditEvents: this.auditEvents }), "utf8");
    renameDemoState(temporaryPath, this.dataPath);
  }

  private audit(context: TenantContext, action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}): void {
    this.auditEvents.unshift({ id: randomUUID(), organizationId: context.organizationExternalId, actorType: context.source === "mcp" ? "mcp" : "user", actorId: context.userExternalId, action, targetType, targetId, metadata: structuredClone(metadata), createdAt: new Date().toISOString() });
  }

  listAuditEvents(context: TenantContext): UiAuditEvent[] {
    this.load(); return this.auditEvents.filter((event) => event.organizationId === context.organizationExternalId).map((event) => structuredClone(event));
  }

  listConnections(context: TenantContext): UiConnection[] {
    void context;
    return ["gmail", "hubspot", "slack"].map((provider) => ({ provider: provider as UiConnection["provider"], status: "CONNECTED", displayName: `Demo ${provider}` }));
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
    this.audit(context, "worker.created", "worker", worker.id, { versionId: version.id });
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
    this.audit(context, "worker.version_created", "worker", worker.id, { versionId: worker.versions.at(-1)!.id });
    this.save();
    return structuredClone(worker);
  }

  commitWorkerProposal(context: TenantContext, input: Readonly<{ workerId?: string; spec: WorkerSpec; specHash: string; ready: boolean }>): Readonly<{ worker: UiWorker; workerVersionId: string; versionNumber: number; createdWorker: boolean }> {
    this.load();
    const spec = structuredClone(input.spec);
    if (hashWorkerSpec(spec) !== input.specHash) throw new Error("BUILDER_PROPOSAL_HASH_MISMATCH");
    const now = new Date().toISOString();
    let worker = input.workerId ? this.workers.find((item) => item.id === input.workerId && item.organizationId === context.organizationExternalId) : undefined;
    const createdWorker = !worker;
    if (input.workerId && !worker) throw new Error("WORKER_NOT_FOUND");
    if (worker?.status === "ARCHIVED") throw new Error("WORKER_ARCHIVED");
    const versionNumber = worker ? Math.max(...worker.versions.map((version) => version.versionNumber)) + 1 : 1;
    const version: UiWorkerVersion = { id: randomUUID(), versionNumber, spec, specHash: input.specHash, createdAt: now };
    if (!worker) {
      worker = { id: randomUUID(), organizationId: context.organizationExternalId, name: spec.identity.name, status: input.ready ? "READY" : "DRAFT", versions: [version], createdAt: now, updatedAt: now };
      this.workers.unshift(worker);
    } else {
      worker.versions.push(version);
      worker.name = spec.identity.name;
      if (worker.status === "DRAFT" || worker.status === "READY") worker.status = input.ready ? "READY" : "DRAFT";
      worker.updatedAt = now;
    }
    this.audit(context, createdWorker ? "worker.created_from_builder" : "worker.version_created_from_builder", "worker", worker.id, { versionId: version.id, specHash: input.specHash });
    this.save();
    return { worker: structuredClone(worker), workerVersionId: version.id, versionNumber, createdWorker };
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
    this.audit(context, `worker.${action}`, "worker", worker.id, { versionId: worker.activeVersionId });
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

  async createPreviewRun(context: TenantContext, workerId: string): Promise<UiRun> {
    this.load();
    const worker = this.workers.find((item) => item.id === workerId && item.organizationId === context.organizationExternalId);
    if (!worker) throw new Error("WORKER_NOT_FOUND");
    const version = worker.versions.find((item) => item.id === worker.activeVersionId) ?? worker.versions.at(-1)!;
    const at = new Date().toISOString();
    const runId = randomUUID();
    const payload: RunWorkerPayload = { organizationId: context.organizationExternalId, workerId, workerVersionId: version.id, runId, mode: "dry_run", trigger: { type: "manual", payload: { fixture: "inbound-sales" } } };
    const integrations = new FakeIntegrationAdapter(); const executions = new MemoryToolExecutionRepository(); const journal = new MemoryRunnerJournal();
    const result = await runWorker({ payload, spec: version.spec, model: new FakeInboundSalesModel(), integrations, executions, journal });
    if (integrations.writes.length !== 0) throw new Error("DRY_RUN_WRITE_INVARIANT_VIOLATED");
    const run: UiRun = {
      id: runId, organizationId: context.organizationExternalId, workerId, workerVersionId: version.id,
      mode: "dry_run", triggerType: "manual", status: result.status, createdAt: at, estimatedCostUsd: 0.0042,
      steps: uiSteps(journal.steps.get(runId) ?? [], at),
    };
    this.runs.unshift(run);
    this.audit(context, "run.dry_run_completed", "run", run.id, { workerId, status: run.status });
    this.save();
    return structuredClone(run);
  }

  async createLiveRun(context: TenantContext, workerId: string): Promise<UiRun> {
    this.load();
    const worker = this.workers.find((item) => item.id === workerId && item.organizationId === context.organizationExternalId);
    if (!worker) throw new Error("WORKER_NOT_FOUND");
    if (worker.status !== "DEPLOYED" || !worker.activeVersionId) throw new Error("WORKER_NOT_DEPLOYED");
    const version = worker.versions.find((item) => item.id === worker.activeVersionId);
    if (!version) throw new Error("WORKER_VERSION_NOT_FOUND");
    const at = new Date().toISOString();
    const runId = randomUUID();
    const payload: RunWorkerPayload = { organizationId: context.organizationExternalId, workerId, workerVersionId: version.id, runId, mode: "live", trigger: { type: "manual", payload: { fixture: "inbound-sales" } } };
    const integrations = new FakeIntegrationAdapter(); const executions = new MemoryToolExecutionRepository(); const journal = new MemoryRunnerJournal();
    const result = await runWorker({ payload, spec: version.spec, model: new FakeInboundSalesModel(), integrations, executions, journal });
    if (result.status !== "WAITING_FOR_APPROVAL" || !result.checkpoint) throw new Error("CANONICAL_APPROVAL_BOUNDARY_NOT_REACHED");
    const run: UiRun = {
      id: runId, organizationId: context.organizationExternalId, workerId, workerVersionId: worker.activeVersionId,
      mode: "live", triggerType: "manual", status: result.status, createdAt: at, estimatedCostUsd: 0.0031,
      steps: uiSteps(journal.steps.get(runId) ?? [], at),
    };
    const approval: UiApproval = {
      id: randomUUID(), organizationId: context.organizationExternalId, workerId, runId: run.id,
      capabilityId: fakeInboundSalesEmailAction.capabilityId, reason: "External email requires human approval", preview: structuredClone(fakeInboundSalesEmailAction.input),
      requestHash: hashActionRequest({ capability: fakeInboundSalesEmailAction.capabilityId, input: fakeInboundSalesEmailAction.input }), status: "PENDING", requestedAt: at,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    this.runs.unshift(run); this.approvals.unshift(approval); this.continuations.push({ runId, checkpoint: result.checkpoint, executions: executions.snapshot() });
    this.audit(context, "run.started", "run", run.id, { workerId, status: run.status }); this.audit(context, "approval.requested", "approval", approval.id, { runId }); this.save();
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
    this.audit(context, "run.cancelled", "run", run.id);
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

  async decideApproval(context: TenantContext, approvalId: string, decision: "approve" | "reject", comment?: string): Promise<UiApproval> {
    this.load(); const approval = this.approvals.find((item) => item.id === approvalId && item.organizationId === context.organizationExternalId);
    if (!approval) throw new Error("APPROVAL_NOT_FOUND"); if (approval.status !== "PENDING") throw new Error("APPROVAL_ALREADY_DECIDED");
    if (new Date(approval.expiresAt) <= new Date()) { approval.status = "EXPIRED"; this.save(); throw new Error("APPROVAL_EXPIRED"); }
    const decidedAt = new Date().toISOString();
    approval.status = decision === "approve" ? "APPROVED" : "REJECTED"; approval.decidedAt = decidedAt; approval.comment = comment;
    const run = this.runs.find((item) => item.id === approval.runId && item.organizationId === context.organizationExternalId);
    if (!run || run.status !== "WAITING_FOR_APPROVAL") throw new Error("RUN_NOT_WAITING_FOR_APPROVAL");
    const approvalStep = run.steps.find((step) => step.type === "approval" && ["PENDING", "WAITING_FOR_APPROVAL"].includes(step.status));
    if (approvalStep) { approvalStep.status = approval.status; approvalStep.summary = decision === "approve" ? "External email action approved" : "External email action rejected"; }
    if (decision === "approve") {
      const continuation = this.continuations.find((item) => item.runId === run.id);
      const worker = this.workers.find((item) => item.id === run.workerId && item.organizationId === context.organizationExternalId);
      const version = worker?.versions.find((item) => item.id === run.workerVersionId);
      if (!continuation || !version) throw new Error("RUN_CONTINUATION_NOT_FOUND");
      const executions = new MemoryToolExecutionRepository(continuation.executions); const integrations = new FakeIntegrationAdapter();
      const key = `${run.id}:${fakeInboundSalesEmailAction.id}`; const waiting = await executions.get(key);
      const exactHash = hashActionRequest({ capability: fakeInboundSalesEmailAction.capabilityId, input: fakeInboundSalesEmailAction.input });
      if (!waiting || waiting.status !== "WAITING_FOR_APPROVAL" || waiting.requestHash !== approval.requestHash || exactHash !== approval.requestHash) throw new Error("APPROVAL_REQUEST_HASH_MISMATCH");
      const emailResult = await integrations.executeCapability(fakeInboundSalesEmailAction.capabilityId, fakeInboundSalesEmailAction.input, { organizationId: context.organizationExternalId, workerId: run.workerId, workerVersionId: run.workerVersionId, runId: run.id, modelToolCallId: fakeInboundSalesEmailAction.id, mode: "live" });
      const emailStatus = emailResult.ok ? "SUCCEEDED" : emailResult.classification === "UNKNOWN_OUTCOME" ? "OUTCOME_UNKNOWN" : "FAILED";
      await executions.save({ ...waiting, status: emailStatus, result: emailResult });
      run.steps.push({ sequence: continuation.checkpoint.nextSequence, type: "tool", status: emailStatus, summary: emailStatus === "SUCCEEDED" ? "Sent one approved Gmail response" : fakeInboundSalesEmailAction.summary, at: decidedAt });
      if (emailStatus === "SUCCEEDED") {
        const journal = new MemoryRunnerJournal();
        const payload: RunWorkerPayload = { organizationId: context.organizationExternalId, workerId: run.workerId, workerVersionId: run.workerVersionId, runId: run.id, mode: "live", trigger: { type: run.triggerType, payload: { fixture: "inbound-sales" } } };
        const checkpoint = { ...continuation.checkpoint, nextSequence: continuation.checkpoint.nextSequence + 1 };
        const resumed = await resumeWorkerFromCheckpoint({ payload, spec: version.spec, checkpoint, integrations, executions, journal });
        run.steps.push(...uiSteps(journal.steps.get(run.id) ?? [], decidedAt)); run.status = resumed.status; run.estimatedCostUsd = 0.0048;
      } else run.status = emailStatus;
      continuation.executions = executions.snapshot();
    } else {
      run.steps.push({ sequence: run.steps.length + 1, type: "approval", status: "REJECTED", summary: "Run stopped because the action was rejected", at: decidedAt });
      run.status = "CANCELLED";
    }
    this.continuations = this.continuations.filter((item) => item.runId !== run.id);
    this.audit(context, decision === "approve" ? "approval.approved" : "approval.rejected", "approval", approval.id, { runId: run.id, finalRunStatus: run.status });
    this.save(); return structuredClone(approval);
  }
}

const globalStore = globalThis as typeof globalThis & { __agentCloudDemoStore?: DemoControlPlaneStore };
export const demoControlPlane = globalStore.__agentCloudDemoStore ??= new DemoControlPlaneStore();
