import { Activity } from "lucide-react";

import { getControlPlane } from "@/application/control-plane";
import { requireTenantContext } from "@/lib/auth/tenant-context";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const events = await (await getControlPlane()).listAuditEvents(await requireTenantContext());
  return <div className="mx-auto max-w-5xl"><p className="eyebrow">Audit trail</p><h1 className="mt-2 text-3xl font-black">Workspace activity</h1><p className="muted mt-2">Security-sensitive lifecycle changes appear in this append-only record.</p>{events.length ? <ol className="card mt-8 divide-y divide-[var(--line)]">{events.map((event) => <li key={event.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-extrabold">{event.action.replaceAll(".", " ")}</p><p className="muted mt-1 text-xs">{event.actorType} · {event.targetType} {event.targetId.slice(0, 12)}</p></div><time className="muted text-xs" dateTime={event.createdAt}>{event.createdAt.slice(0, 19).replace("T", " ")} UTC</time></li>)}</ol> : <div className="card mt-8 flex min-h-64 flex-col items-center justify-center p-8 text-center"><Activity size={30} className="text-[var(--accent)]" /><h2 className="mt-4 font-black">No recorded changes yet</h2><p className="muted mt-2 text-sm">Create, deploy, pause, or approve a worker action to add an event.</p></div>}</div>;
}
