import type { CompilationResult } from "@/application/compiler/compiler";
import { canonicalJson, hashWorkerSpec } from "@/domain/canonical-json";
import { parseWorkerSpec, type WorkerSpec } from "@/domain/worker-spec";

export type ProposalReadinessStatus = "passed" | "warning" | "blocked";

export type ProposalReadinessCheck = Readonly<{
  id: "authority" | "connections" | "capabilities" | "questions" | "warnings";
  status: ProposalReadinessStatus;
  title: string;
  detail: string;
}>;

export type ProposalReadiness = Readonly<{
  ready: boolean;
  checks: readonly ProposalReadinessCheck[];
}>;

export type WorkerSpecDiff = Readonly<{
  path: string;
  kind: "added" | "removed" | "changed";
  before?: string;
  after?: string;
  summary: string;
}>;

export type WorkerProposal = Readonly<{
  spec: WorkerSpec;
  specHash: string;
  summary: string;
  readiness: ProposalReadiness;
  diff: readonly WorkerSpecDiff[];
  requiredConnections: CompilationResult["requiredConnections"];
  missingConnections: CompilationResult["missingConnections"];
  unsupportedCapabilities: readonly string[];
  warnings: readonly string[];
  questions: readonly string[];
}>;

const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function joinList(values: readonly string[]): string {
  return uniqueSorted(values).join(", ");
}

export function assessProposalReadiness(compilation: CompilationResult): ProposalReadiness {
  const spec = parseWorkerSpec(compilation.spec);
  const missingConnections = uniqueSorted(compilation.missingConnections);
  const unsupportedCapabilities = uniqueSorted(compilation.unsupportedCapabilities);
  const questions = uniqueSorted(compilation.questions);
  const warnings = uniqueSorted(compilation.warnings);
  const checks: ProposalReadinessCheck[] = [
    {
      id: "authority",
      status: "passed",
      title: "Default-deny authority",
      detail: `Unknown operations are denied; ${spec.authority.rules.length} explicit authority rule(s) were validated.`,
    },
    {
      id: "connections",
      status: missingConnections.length === 0 ? "passed" : "blocked",
      title: "Integration connections",
      detail: missingConnections.length === 0
        ? compilation.requiredConnections.length === 0
          ? "No integration connections are required."
          : "All required integration connections are available."
        : `Connect before deployment: ${joinList(missingConnections)}.`,
    },
    {
      id: "capabilities",
      status: unsupportedCapabilities.length === 0 ? "passed" : "blocked",
      title: "Curated capabilities",
      detail: unsupportedCapabilities.length === 0
        ? "Every requested capability is registered; all other capabilities remain denied."
        : `Remove or replace unsupported capabilities: ${joinList(unsupportedCapabilities)}.`,
    },
    {
      id: "questions",
      status: questions.length === 0 ? "passed" : "blocked",
      title: "Human decisions",
      detail: questions.length === 0
        ? "No unresolved product decisions remain."
        : `Answer before deployment: ${joinList(questions)}.`,
    },
    {
      id: "warnings",
      status: warnings.length === 0 ? "passed" : "warning",
      title: "Compiler warnings",
      detail: warnings.length === 0 ? "No compiler warnings." : joinList(warnings),
    },
  ];

  return { ready: checks.every((check) => check.status !== "blocked"), checks };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function displayValue(value: unknown): string {
  if (value === undefined) return "not set";
  if (typeof value === "string") return JSON.stringify(value);
  return canonicalJson(value);
}

function appendDiff(
  result: WorkerSpecDiff[],
  path: string,
  before: unknown,
  after: unknown,
): void {
  if (canonicalJson(before) === canonicalJson(after)) return;

  if (isRecord(before) && isRecord(after)) {
    const keys = uniqueSorted([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) appendDiff(result, path ? `${path}.${key}` : key, before[key], after[key]);
    return;
  }

  const beforeText = displayValue(before);
  const afterText = displayValue(after);
  const kind = before === undefined ? "added" : after === undefined ? "removed" : "changed";
  const summary = kind === "added"
    ? `${path}: added ${afterText}`
    : kind === "removed"
      ? `${path}: removed ${beforeText}`
      : `${path}: changed from ${beforeText} to ${afterText}`;

  result.push({
    path,
    kind,
    ...(before === undefined ? {} : { before: beforeText }),
    ...(after === undefined ? {} : { after: afterText }),
    summary,
  });
}

export function diffWorkerSpecs(base: WorkerSpec | undefined, proposed: WorkerSpec): readonly WorkerSpecDiff[] {
  const next = parseWorkerSpec(proposed);
  if (!base) {
    const after = `WorkerSpec ${next.schemaVersion} “${next.identity.name}”`;
    return [{ path: "$", kind: "added", after, summary: `Create ${after}` }];
  }

  const previous = parseWorkerSpec(base);
  const result: WorkerSpecDiff[] = [];
  appendDiff(result, "", previous, next);
  return result.sort((left, right) => compareText(left.path, right.path));
}

export function createWorkerProposal(compilation: CompilationResult, baseSpec?: WorkerSpec): WorkerProposal {
  const spec = parseWorkerSpec(compilation.spec);
  return {
    spec,
    specHash: hashWorkerSpec(spec),
    summary: compilation.summary,
    readiness: assessProposalReadiness({ ...compilation, spec }),
    diff: diffWorkerSpecs(baseSpec, spec),
    requiredConnections: uniqueSorted(compilation.requiredConnections) as CompilationResult["requiredConnections"],
    missingConnections: uniqueSorted(compilation.missingConnections) as CompilationResult["missingConnections"],
    unsupportedCapabilities: uniqueSorted(compilation.unsupportedCapabilities),
    warnings: uniqueSorted(compilation.warnings),
    questions: uniqueSorted(compilation.questions),
  };
}
