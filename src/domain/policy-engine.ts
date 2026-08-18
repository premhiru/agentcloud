import { getCapability } from "./tool-registry";
import type { WorkerSpec } from "./worker-spec";

export type PolicyDecision =
  | { decision: "allow" }
  | { decision: "deny"; reason: string }
  | { decision: "require_approval"; reason: string };

export type PolicyRequest = Readonly<{
  spec: WorkerSpec;
  capabilityId: string;
  input: unknown;
  executionsToday?: number;
}>;

function recipientDomains(input: unknown): string[] {
  if (!input || typeof input !== "object") return [];
  const to = (input as { to?: unknown }).to;
  if (!Array.isArray(to)) return [];
  return to.flatMap((recipient) => typeof recipient === "string" && recipient.includes("@") ? [recipient.split("@").at(-1)!.toLowerCase()] : []);
}

export function evaluatePolicy(request: PolicyRequest): PolicyDecision {
  const capability = getCapability(request.capabilityId);
  if (!capability) return { decision: "deny", reason: "Unknown capabilities are denied" };

  const granted = request.spec.capabilities.some((grant) => grant.capability === request.capabilityId);
  if (!granted) return { decision: "deny", reason: "Capability is not granted to this worker version" };

  const parsedInput = capability.inputSchema.safeParse(request.input);
  if (!parsedInput.success) return { decision: "deny", reason: "Capability input failed validation" };

  const rule = request.spec.authority.rules.find((item) => item.capability === request.capabilityId);
  if (!rule) return { decision: "deny", reason: "No explicit authority rule; default effect is deny" };
  if (rule.effect === "deny") return { decision: "deny", reason: "Authority rule explicitly denies this capability" };

  const constraints = rule.constraints;
  if (constraints?.maxPerDay !== undefined && (request.executionsToday ?? 0) >= constraints.maxPerDay) {
    return { decision: "deny", reason: "Daily capability limit reached" };
  }

  const domains = recipientDomains(parsedInput.data);
  if (constraints?.blockedDomains?.some((domain) => domains.includes(domain))) {
    return { decision: "deny", reason: "Recipient domain is blocked" };
  }
  if (constraints?.allowedDomains?.length && domains.some((domain) => !constraints.allowedDomains!.includes(domain))) {
    return { decision: "deny", reason: "Recipient domain is not allowed" };
  }

  if (rule.effect === "require_approval") {
    return { decision: "require_approval", reason: "Worker authority requires human approval" };
  }
  return { decision: "allow" };
}
