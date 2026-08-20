import { IntegrationCard } from "@/components/integration-card";
import { getControlPlane } from "@/application/control-plane";
import { requirePageTenantContext } from "@/lib/auth/page-tenant-context";
import { isDemoMode } from "@/lib/env";

const integrations = [["gmail", "Gmail", "Read enquiries and send approved replies"], ["hubspot", "HubSpot", "Find and update contacts and notes"], ["slack", "Slack", "Post qualified-lead summaries"]] as const;

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const demo = isDemoMode(); const connected = await (await getControlPlane()).listConnections(await requirePageTenantContext()); const statuses = new Map(connected.map((item) => [item.provider, item]));
  return <div className="mx-auto max-w-5xl"><p className="eyebrow">Integrations</p><h1 className="mt-2 text-3xl font-black">Connected tools</h1><p className="muted mt-2">OAuth credentials stay with the connection provider. AgentCloud stores only opaque account references.</p><div className="mt-8 grid gap-4 md:grid-cols-3">{integrations.map(([provider, name, description]) => <IntegrationCard key={provider} provider={provider} name={name} description={description} demo={demo} status={statuses.get(provider)?.status} displayName={statuses.get(provider)?.displayName} />)}</div>{demo && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Demo mode:</strong> these connections use realistic fixtures and cannot reach external services. Production never falls back to them automatically.</div>}</div>;
}
