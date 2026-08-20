import { randomUUID } from "node:crypto";

import { hashWorkerSpec } from "@/domain/canonical-json";
import { getCapability, validateRegisteredCapabilities } from "@/domain/tool-registry";
import { parseWorkerSpec } from "@/domain/worker-spec";
import { assessProposalReadiness, type WorkerProposal } from "./proposal";

export type BuilderSessionStatus = "OPEN" | "READY" | "COMMITTED" | "ABANDONED";
export type BuilderMessageRole = "user" | "assistant" | "system";

export type BuilderMessage = Readonly<{
  id: string;
  organizationId: string;
  sessionId: string;
  sequence: number;
  role: BuilderMessageRole;
  content: string;
  createdAt: string;
}>;

export type BuilderProposalRevision = Readonly<{
  id: string;
  organizationId: string;
  sessionId: string;
  revision: number;
  proposal: WorkerProposal;
  createdAt: string;
}>;

export type BuilderSession = Readonly<{
  id: string;
  organizationId: string;
  workerId?: string;
  baseWorkerVersionId?: string;
  status: BuilderSessionStatus;
  revision: number;
  createdBy: string;
  committedWorkerVersionId?: string;
  createdAt: string;
  updatedAt: string;
  messages: readonly BuilderMessage[];
  proposals: readonly BuilderProposalRevision[];
}>;

export type CreateBuilderSessionInput = Readonly<{
  organizationId: string;
  createdBy: string;
  workerId?: string;
  baseWorkerVersionId?: string;
}>;

export type AppendBuilderProposalInput = Readonly<{
  organizationId: string;
  sessionId: string;
  expectedRevision: number;
  userMessage: string;
  proposal: WorkerProposal;
}>;

export type CommitBuilderProposalInput = Readonly<{
  organizationId: string;
  sessionId: string;
  expectedRevision: number;
  expectedSpecHash: string;
}>;

export type BuilderCommitResult = Readonly<{
  session: BuilderSession;
  workerId: string;
  workerVersionId: string;
  versionNumber: number;
  createdWorker: boolean;
}>;

export interface BuilderProposalCommitter {
  commit(input: CommitBuilderProposalInput): Promise<BuilderCommitResult>;
}

export interface BuilderSessionRepository {
  create(input: CreateBuilderSessionInput): Promise<BuilderSession>;
  get(organizationId: string, sessionId: string): Promise<BuilderSession | undefined>;
  appendProposal(input: AppendBuilderProposalInput): Promise<BuilderSession>;
  abandon(organizationId: string, sessionId: string, expectedRevision: number): Promise<BuilderSession>;
}

const secretAssignment = /\b(authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|secret|password|cookie)\b\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi;
const bearerToken = /\bbearer\s+[a-z0-9._~+/=-]{12,}/gi;
const commonToken = /\b(?:sk|ghp|github_pat|xox[baprs])-[-a-z0-9_]{12,}/gi;

export function redactBuilderMessage(content: string): string {
  const normalized = content.trim().slice(0, 4_000);
  return normalized
    .replace(secretAssignment, (_match, key: string) => `${key}=[REDACTED]`)
    .replace(bearerToken, "Bearer [REDACTED]")
    .replace(commonToken, "[REDACTED]");
}

export function validateBuilderProposal(proposal: WorkerProposal): WorkerProposal {
  const spec = parseWorkerSpec(proposal.spec);
  const actualHash = hashWorkerSpec(spec);
  if (proposal.specHash !== actualHash) throw new Error("BUILDER_PROPOSAL_HASH_MISMATCH");
  const registration = validateRegisteredCapabilities(spec.capabilities.map((grant) => grant.capability));
  if (registration.unsupported.length) throw new Error("BUILDER_PROPOSAL_UNSUPPORTED_CAPABILITY");
  for (const rule of spec.authority.rules) {
    const capability = getCapability(rule.capability);
    if (capability?.risk === "high" && rule.effect === "allow") throw new Error("BUILDER_PROPOSAL_UNSAFE_AUTHORITY");
  }
  const readiness = assessProposalReadiness({
    spec,
    requiredConnections: [...proposal.requiredConnections],
    missingConnections: [...proposal.missingConnections],
    unsupportedCapabilities: [...proposal.unsupportedCapabilities],
    warnings: [...proposal.warnings],
    questions: [...proposal.questions],
    summary: proposal.summary,
  });
  return structuredClone({ ...proposal, spec, specHash: actualHash, readiness });
}

function cloneSession(session: BuilderSession): BuilderSession {
  return structuredClone(session);
}

export class MemoryBuilderSessionRepository implements BuilderSessionRepository {
  private readonly sessions = new Map<string, BuilderSession>();

  async create(input: CreateBuilderSessionInput): Promise<BuilderSession> {
    const now = new Date().toISOString();
    const session: BuilderSession = {
      id: randomUUID(), organizationId: input.organizationId, workerId: input.workerId,
      baseWorkerVersionId: input.baseWorkerVersionId, status: "OPEN", revision: 0,
      createdBy: input.createdBy, createdAt: now, updatedAt: now, messages: [], proposals: [],
    };
    this.sessions.set(session.id, session);
    return cloneSession(session);
  }

  async get(organizationId: string, sessionId: string): Promise<BuilderSession | undefined> {
    const session = this.sessions.get(sessionId);
    return session?.organizationId === organizationId ? cloneSession(session) : undefined;
  }

  async appendProposal(input: AppendBuilderProposalInput): Promise<BuilderSession> {
    const current = this.sessions.get(input.sessionId);
    if (!current || current.organizationId !== input.organizationId) throw new Error("BUILDER_SESSION_NOT_FOUND");
    if (current.status === "COMMITTED" || current.status === "ABANDONED") throw new Error("BUILDER_SESSION_CLOSED");
    if (current.revision !== input.expectedRevision) throw new Error("BUILDER_REVISION_CONFLICT");
    const safeMessage = redactBuilderMessage(input.userMessage);
    if (!safeMessage) throw new Error("BUILDER_MESSAGE_REQUIRED");
    const safeProposal = validateBuilderProposal(input.proposal);
    const revision = current.revision + 1;
    const now = new Date().toISOString();
    const message: BuilderMessage = {
      id: randomUUID(), organizationId: current.organizationId, sessionId: current.id,
      sequence: revision, role: "user", content: safeMessage, createdAt: now,
    };
    const proposal: BuilderProposalRevision = {
      id: randomUUID(), organizationId: current.organizationId, sessionId: current.id,
      revision, proposal: safeProposal, createdAt: now,
    };
    const updated: BuilderSession = {
      ...current, revision, status: safeProposal.readiness.ready ? "READY" : "OPEN", updatedAt: now,
      messages: [...current.messages, message], proposals: [...current.proposals, proposal],
    };
    this.sessions.set(current.id, updated);
    return cloneSession(updated);
  }

  async abandon(organizationId: string, sessionId: string, expectedRevision: number): Promise<BuilderSession> {
    const current = this.sessions.get(sessionId);
    if (!current || current.organizationId !== organizationId) throw new Error("BUILDER_SESSION_NOT_FOUND");
    if (current.status === "COMMITTED" || current.status === "ABANDONED") throw new Error("BUILDER_SESSION_CLOSED");
    if (current.revision !== expectedRevision) throw new Error("BUILDER_REVISION_CONFLICT");
    const updated: BuilderSession = { ...current, status: "ABANDONED", updatedAt: new Date().toISOString() };
    this.sessions.set(current.id, updated);
    return cloneSession(updated);
  }

  commitWith(
    input: CommitBuilderProposalInput,
    persist: (proposal: WorkerProposal, session: BuilderSession) => Omit<BuilderCommitResult, "session">,
  ): BuilderCommitResult {
    const current = this.sessions.get(input.sessionId);
    if (!current || current.organizationId !== input.organizationId) throw new Error("BUILDER_SESSION_NOT_FOUND");
    if (current.status === "COMMITTED" || current.status === "ABANDONED") throw new Error("BUILDER_SESSION_CLOSED");
    if (current.revision !== input.expectedRevision) throw new Error("BUILDER_REVISION_CONFLICT");
    const latest = current.proposals.at(-1);
    if (!latest || latest.revision !== current.revision) throw new Error("BUILDER_PROPOSAL_NOT_FOUND");
    const proposal = validateBuilderProposal(latest.proposal);
    if (proposal.specHash !== input.expectedSpecHash) throw new Error("BUILDER_PROPOSAL_CHANGED");
    const persisted = persist(proposal, cloneSession(current));
    const updated: BuilderSession = {
      ...current, workerId: persisted.workerId, committedWorkerVersionId: persisted.workerVersionId,
      status: "COMMITTED", updatedAt: new Date().toISOString(),
    };
    this.sessions.set(current.id, updated);
    return { ...persisted, session: cloneSession(updated) };
  }
}
