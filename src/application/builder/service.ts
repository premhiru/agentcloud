import {
  compileWorker,
  type CompilerModel,
} from "@/application/compiler/compiler";
import { createWorkerProposal } from "@/application/builder/proposal";
import {
  redactBuilderMessage,
  type BuilderSession,
  type BuilderSessionRepository,
} from "@/application/builder/session";
import type { IntegrationProvider } from "@/domain/tool-registry";
import type { WorkerSpec } from "@/domain/worker-spec";

const MAX_OBJECTIVE_LENGTH = 2_000;
const MAX_CONSTRAINT_LENGTH = 500;
const MAX_CONSTRAINTS = 20;
const MAX_STORED_MESSAGE_LENGTH = 4_000;
const CONSTRAINT_ENVELOPE = "\n\n[AgentCloud builder constraints]\n";

export type ConnectionProviderResolver = (
  organizationId: string,
) => Promise<readonly IntegrationProvider[]>;

export type StartBuilderInput = Readonly<{
  organizationId: string;
  userId: string;
  objective: string;
  constraints?: readonly string[];
  workerId?: string;
  baseWorkerVersionId?: string;
  baseSpec?: WorkerSpec;
}>;

export type GetBuilderInput = Readonly<{
  organizationId: string;
  sessionId: string;
}>;

export type RefineBuilderInput = Readonly<{
  organizationId: string;
  sessionId: string;
  expectedRevision: number;
  message: string;
}>;

export type AbandonBuilderInput = Readonly<{
  organizationId: string;
  sessionId: string;
  expectedRevision: number;
}>;

function safeObjective(value: string): string {
  return redactBuilderMessage(value).slice(0, MAX_OBJECTIVE_LENGTH).trim();
}

function safeConstraint(value: string): string {
  return redactBuilderMessage(value).slice(0, MAX_CONSTRAINT_LENGTH).trim();
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function encodeStartMessage(objective: string, constraints: readonly string[]): string {
  return `${objective}${CONSTRAINT_ENVELOPE}${JSON.stringify(constraints)}`;
}

function boundStartConstraints(objective: string, values: readonly string[]): string[] {
  const constraints: string[] = [];
  for (const value of values) {
    const constraint = safeConstraint(value);
    if (!constraint || constraints.includes(constraint)) continue;
    if (constraints.length === MAX_CONSTRAINTS) break;
    const candidate = [...constraints, constraint];
    if (encodeStartMessage(objective, candidate).length > MAX_STORED_MESSAGE_LENGTH) break;
    constraints.push(constraint);
  }
  return constraints;
}

function initialConstraints(session: BuilderSession): string[] {
  const firstMessage = session.messages[0]?.content;
  if (!firstMessage) return [];
  const marker = firstMessage.lastIndexOf(CONSTRAINT_ENVELOPE);
  if (marker < 0) return [];

  try {
    const decoded: unknown = JSON.parse(firstMessage.slice(marker + CONSTRAINT_ENVELOPE.length));
    if (!Array.isArray(decoded)) return [];
    return decoded
      .filter((value): value is string => typeof value === "string")
      .map(safeConstraint)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function priorConstraints(session: BuilderSession): string[] {
  return unique([
    ...initialConstraints(session),
    ...session.messages.slice(1).map(({ content }) => safeConstraint(content)).filter(Boolean),
  ]);
}

function refinementConstraints(session: BuilderSession, message: string): string[] {
  const current = safeConstraint(message);
  if (!current) return [];
  const prior = priorConstraints(session).filter((constraint) => constraint !== current);
  return [...prior.slice(-(MAX_CONSTRAINTS - 1)), current];
}

function connectedProviders(providers: readonly IntegrationProvider[]): IntegrationProvider[] {
  return unique(providers);
}

export class BuilderService {
  constructor(
    private readonly repository: BuilderSessionRepository,
    private readonly model: CompilerModel,
    private readonly resolveConnections: ConnectionProviderResolver,
  ) {}

  async start(input: StartBuilderInput): Promise<BuilderSession> {
    const objective = safeObjective(input.objective);
    const constraints = boundStartConstraints(objective, input.constraints ?? []);
    const connections = connectedProviders(await this.resolveConnections(input.organizationId));
    const compilation = await compileWorker({
      objective,
      constraints,
      connectedIntegrations: connections,
      baseSpec: input.baseSpec,
    }, this.model);
    const proposal = createWorkerProposal(compilation, input.baseSpec);
    const session = await this.repository.create({
      organizationId: input.organizationId,
      createdBy: input.userId,
      workerId: input.workerId,
      baseWorkerVersionId: input.baseWorkerVersionId,
    });
    return this.repository.appendProposal({
      organizationId: input.organizationId,
      sessionId: session.id,
      expectedRevision: 0,
      userMessage: encodeStartMessage(objective, constraints),
      proposal,
    });
  }

  async get(input: GetBuilderInput): Promise<BuilderSession | undefined> {
    return this.repository.get(input.organizationId, input.sessionId);
  }

  async refine(input: RefineBuilderInput): Promise<BuilderSession> {
    const session = await this.repository.get(input.organizationId, input.sessionId);
    if (!session) throw new Error("BUILDER_SESSION_NOT_FOUND");
    if (session.status === "COMMITTED" || session.status === "ABANDONED") {
      throw new Error("BUILDER_SESSION_CLOSED");
    }
    if (session.revision !== input.expectedRevision) throw new Error("BUILDER_REVISION_CONFLICT");

    const message = safeConstraint(input.message);
    if (!message) throw new Error("BUILDER_MESSAGE_REQUIRED");
    const latest = session.proposals.at(-1);
    if (!latest) throw new Error("BUILDER_PROPOSAL_NOT_FOUND");
    const constraints = refinementConstraints(session, message);
    const connections = connectedProviders(await this.resolveConnections(input.organizationId));
    const compilation = await compileWorker({
      objective: latest.proposal.spec.objective,
      constraints,
      connectedIntegrations: connections,
      baseSpec: latest.proposal.spec,
    }, this.model);
    const proposal = createWorkerProposal(compilation, latest.proposal.spec);

    return this.repository.appendProposal({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      expectedRevision: input.expectedRevision,
      userMessage: message,
      proposal,
    });
  }

  async abandon(input: AbandonBuilderInput): Promise<BuilderSession> {
    return this.repository.abandon(
      input.organizationId,
      input.sessionId,
      input.expectedRevision,
    );
  }
}
