import { getControlPlane } from "@/application/control-plane";
import { IntegrationCard } from "@/components/integration-card";
import { listCapabilities } from "@/domain/tool-registry";
import { getPreferredConnectionConfiguration } from "@/integrations/connection-service";
import { safeConnectionReturnTo } from "@/integrations/connection-return";
import { requirePageTenantContext } from "@/lib/auth/page-tenant-context";
import { isDemoMode } from "@/lib/env";

const connections = [
  ["gmail", "Gmail", "Read enquiries and send approved replies"],
  ["hubspot", "HubSpot", "Find and update contacts and notes"],
  ["slack", "Slack", "Post qualified-lead summaries"],
] as const;

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams; const requestedProvider = typeof query.provider === "string" && ["gmail", "hubspot", "slack"].includes(query.provider) ? query.provider : undefined;
  const returnTo = safeConnectionReturnTo(typeof query.returnTo === "string" ? query.returnTo : undefined);
  const demo = isDemoMode();
  const connected = await (await getControlPlane()).listConnections(await requirePageTenantContext());
  const statuses = new Map(connected.map((item) => [item.provider, item]));
  const configurations = new Map(connections.map(([provider]) => [provider, demo ? { configured: true, missing: [] as readonly string[], method: "demo" } : getPreferredConnectionConfiguration(provider)]));
  const needsSetup = !demo && [...configurations.values()].some((configuration) => !configuration.configured);

  return (
    <div className="mx-auto max-w-5xl">
      <p className="eyebrow">Connections</p>
      <h1 className="mt-2 text-3xl font-black">Connected tools</h1>
      <p className="muted mt-2">Connect once, then grant workers only the exact capabilities they need. Official remote MCP is preferred where its tool coverage is sufficient; managed OAuth fills verified gaps.</p>
      {requestedProvider ? <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><strong>One step to make this worker ready:</strong> connect {connections.find(([provider]) => provider === requestedProvider)?.[1]}. You will return to the worker after consent, and AgentCloud will verify the exact MCP tools made available.</div> : null}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {connections.map(([provider, name, description]) => {
          const configuration = configurations.get(provider)!;
          const status = statuses.get(provider); const totalCapabilities = listCapabilities().filter((capability) => capability.integration === provider).length;
          return <IntegrationCard key={provider} provider={provider} name={name} description={description} demo={demo} configured={configuration.configured} missingConfiguration={configuration.missing} method={"method" in configuration ? configuration.method : undefined} returnTo={returnTo} highlighted={provider === requestedProvider} status={status?.status} displayName={status?.displayName} supportedCapabilities={status?.supportedCapabilities?.length} totalCapabilities={totalCapabilities} />;
        })}
      </div>
      {demo && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Demo mode:</strong> these connections use realistic fixtures and cannot reach external services. Production never falls back to them automatically.</div>}
      {needsSetup && <div id="integration-setup" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Real OAuth is not configured for this AgentCloud environment.</strong> Register AgentCloud OAuth clients for the official provider MCP servers, or configure the managed OAuth fallback, then restart the app. Until then, use the <a className="font-extrabold underline" href="https://agentcloud-control-plane.premhiru.chatgpt.site/demo">credential-free deterministic demo</a> to test the complete lifecycle without external writes.</div>}
    </div>
  );
}
