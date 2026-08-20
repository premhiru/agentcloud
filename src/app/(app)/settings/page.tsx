import { requirePageTenantContext } from "@/lib/auth/page-tenant-context";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const context = await requirePageTenantContext(); const demo = isDemoMode();
  return <div className="mx-auto max-w-4xl"><p className="eyebrow">Settings</p><h1 className="mt-2 text-3xl font-black">Workspace controls</h1><div className="card mt-8 divide-y divide-[var(--line)]"><section className="p-6"><p className="text-sm font-extrabold">Workspace</p><p className="muted mt-2 break-all text-sm">{context.organizationExternalId} · {context.role} access</p></section><section className="p-6"><p className="text-sm font-extrabold">Safety posture</p><p className="muted mt-2 text-sm">Default deny · Approval request expiry enabled · External writes are idempotent</p></section><section className="p-6"><p className="text-sm font-extrabold">Runtime</p><p className="muted mt-2 text-sm">{demo ? "Deterministic credential-free demo runtime." : "Trigger.dev durable runtime with PostgreSQL state and Composio integrations."}</p></section></div></div>;
}
