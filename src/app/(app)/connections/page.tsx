import { getControlPlane } from "@/application/control-plane";
import { IntegrationCard } from "@/components/integration-card";
import { getComposioConfiguration } from "@/integrations/composio-adapter";
import { requirePageTenantContext } from "@/lib/auth/page-tenant-context";
import { isDemoMode } from "@/lib/env";

const connections = [
  ["gmail", "Gmail", "Read enquiries and send approved replies"],
  ["hubspot", "HubSpot", "Find and update contacts and notes"],
  ["slack", "Slack", "Post qualified-lead summaries"],
] as const;

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const demo = isDemoMode();
  const connected = await (await getControlPlane()).listConnections(await requirePageTenantContext());
  const statuses = new Map(connected.map((item) => [item.provider, item]));
  const configurations = new Map(connections.map(([provider]) => [provider, demo ? { configured: true, missing: [] as readonly string[] } : getComposioConfiguration(provider)]));
  const needsSetup = !demo && [...configurations.values()].some((configuration) => !configuration.configured);

  return (
    <div className="mx-auto max-w-5xl">
      <p className="eyebrow">Connections</p>
      <h1 className="mt-2 text-3xl font-black">Connected tools</h1>
      <p className="muted mt-2">OAuth credentials stay with the connection provider. AgentCloud stores only opaque account references.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {connections.map(([provider, name, description]) => {
          const configuration = configurations.get(provider)!;
          return <IntegrationCard key={provider} provider={provider} name={name} description={description} demo={demo} configured={configuration.configured} missingConfiguration={configuration.missing} status={statuses.get(provider)?.status} displayName={statuses.get(provider)?.displayName} />;
        })}
      </div>
      {demo && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Demo mode:</strong> these connections use realistic fixtures and cannot reach external services. Production never falls back to them automatically.</div>}
      {needsSetup && <div id="integration-setup" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Real OAuth is not configured for this AgentCloud environment.</strong> Add the server-only Composio API key and each provider auth-config ID, then restart the app. Until then, use the <a className="font-extrabold underline" href="https://agentcloud-control-plane.premhiru.chatgpt.site/demo">credential-free deterministic demo</a> to test Gmail, HubSpot, Slack, approvals, and duplicate-side-effect protection without external writes.</div>}
    </div>
  );
}
