import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

import { demoControlPlane } from "@/application/control-plane/demo-store";
import { StatusBadge } from "@/components/status-badge";
import { requireTenantContext } from "@/lib/auth/tenant-context";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const workers = demoControlPlane.listWorkers(await requireTenantContext());
  return <div className="mx-auto max-w-6xl"><div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Workers</p><h1 className="mt-2 text-3xl font-black">Your AI workforce</h1><p className="muted mt-2">Every worker has explicit authority, version history, and an observable run record.</p></div><Link href="/workers/new" className="button"><Plus size={17} />Create worker</Link></div>
    <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--line)] bg-white"><div className="hidden grid-cols-[1.6fr_.7fr_.8fr_.8fr_auto] gap-4 border-b border-[var(--line)] px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--muted)] md:grid"><span>Worker</span><span>Status</span><span>Last run</span><span>Est. monthly</span><span /></div>
      {workers.map((worker) => <Link key={worker.id} href={`/workers/${worker.id}`} className="grid gap-3 border-b border-[var(--line)] px-5 py-5 last:border-0 hover:bg-slate-50 md:grid-cols-[1.6fr_.7fr_.8fr_.8fr_auto] md:items-center"><div><p className="font-extrabold">{worker.name}</p><p className="muted mt-1 line-clamp-1 text-sm">{worker.versions.at(-1)?.spec.objective}</p></div><div><StatusBadge status={worker.status} /></div><span className="muted text-sm">No live run</span><span className="text-sm font-bold">$0.00</span><ArrowRight size={17} className="text-[var(--muted)]" /></Link>)}
    </div></div>;
}
