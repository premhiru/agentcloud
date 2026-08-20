import type { UiConnection } from "@/application/control-plane/demo-store";
import { getCapability, type IntegrationProvider } from "@/domain/tool-registry";
import type { WorkerSpec } from "@/domain/worker-spec";

type WorkerStatus = "DRAFT" | "READY" | "DEPLOYED" | "PAUSED" | "ARCHIVED";

export type StudioReadinessCheck = Readonly<{
  id: "authority" | "connections" | "lifecycle" | "support";
  label: string;
  detail: string;
  status: "pass" | "warning" | "blocked";
}>;

export type RequiredProvider = Readonly<{
  provider: IntegrationProvider;
  capabilities: readonly string[];
  connectionStatus: UiConnection["status"] | "NOT_CONNECTED";
  connected: boolean;
}>;

export type WorkerStudioReadiness = Readonly<{
  readyForDeploy: boolean;
  requiredProviders: readonly RequiredProvider[];
  unsupportedCapabilities: readonly string[];
  explicitAuthorityCount: number;
  approvalCount: number;
  checks: readonly StudioReadinessCheck[];
}>;

function joinList(items: readonly string[]): string {
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(items);
}

export function providerLabel(provider: string): string {
  if (provider === "hubspot") return "HubSpot";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function deriveWorkerStudioReadiness(
  spec: WorkerSpec,
  workerStatus: WorkerStatus,
  connections: readonly Pick<UiConnection, "provider" | "status">[],
): WorkerStudioReadiness {
  const connectionStatuses = new Map(connections.map((connection) => [connection.provider, connection.status]));
  const providers = new Map<IntegrationProvider, string[]>();
  const unsupportedCapabilities: string[] = [];

  for (const grant of spec.capabilities) {
    const capability = getCapability(grant.capability);
    if (!capability) {
      unsupportedCapabilities.push(grant.capability);
      continue;
    }
    const providerCapabilities = providers.get(capability.integration) ?? [];
    providerCapabilities.push(grant.capability);
    providers.set(capability.integration, providerCapabilities);
  }

  const requiredProviders = [...providers.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([provider, capabilities]) => {
      const connectionStatus = connectionStatuses.get(provider) ?? "NOT_CONNECTED";
      return {
        provider,
        capabilities: [...capabilities].sort(),
        connectionStatus,
        connected: connectionStatus === "CONNECTED",
      } satisfies RequiredProvider;
    });

  const governedCapabilities = new Set(spec.authority.rules.map((rule) => rule.capability));
  const missingAuthority = spec.capabilities
    .map((grant) => grant.capability)
    .filter((capability) => !governedCapabilities.has(capability));
  const missingProviders = requiredProviders.filter((provider) => !provider.connected).map(({ provider }) => providerLabel(provider));
  const lifecycleBlocked = workerStatus === "ARCHIVED";
  const lifecycleNeedsReview = workerStatus === "DRAFT";

  const checks: StudioReadinessCheck[] = [
    {
      id: "support",
      label: "Registered capabilities",
      status: unsupportedCapabilities.length === 0 ? "pass" : "blocked",
      detail: unsupportedCapabilities.length === 0
        ? `All ${spec.capabilities.length} granted capabilities are supported by the runtime.`
        : `Unsupported capabilities: ${joinList(unsupportedCapabilities)}.`,
    },
    {
      id: "authority",
      label: "Default-deny authority",
      status: spec.authority.defaultEffect === "deny" && missingAuthority.length === 0 ? "pass" : "blocked",
      detail: missingAuthority.length === 0
        ? `Every granted capability has an explicit rule; ${spec.authority.rules.filter((rule) => rule.effect === "require_approval").length} require human approval.`
        : `Missing explicit rules: ${joinList(missingAuthority)}.`,
    },
    {
      id: "connections",
      label: "Required connections",
      status: missingProviders.length === 0 ? "pass" : "blocked",
      detail: requiredProviders.length === 0
        ? "This version does not require an external integration."
        : missingProviders.length === 0
          ? `${joinList(requiredProviders.map(({ provider }) => providerLabel(provider)))} ${requiredProviders.length === 1 ? "is" : "are"} connected.`
          : `Connect ${joinList(missingProviders)} before deployment.`,
    },
    {
      id: "lifecycle",
      label: "Lifecycle state",
      status: lifecycleBlocked ? "blocked" : lifecycleNeedsReview ? "warning" : "pass",
      detail: lifecycleBlocked
        ? "Archived workers cannot be tested or deployed."
        : lifecycleNeedsReview
          ? "This draft still needs review before it is deployment-ready."
          : `${workerStatus.charAt(0)}${workerStatus.slice(1).toLowerCase()} is an operable lifecycle state.`,
    },
  ];

  return {
    readyForDeploy: checks.every((check) => check.status === "pass"),
    requiredProviders,
    unsupportedCapabilities: [...unsupportedCapabilities].sort(),
    explicitAuthorityCount: governedCapabilities.size,
    approvalCount: spec.authority.rules.filter((rule) => rule.effect === "require_approval").length,
    checks,
  };
}
