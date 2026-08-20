import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

import { getControlPlane } from "@/application/control-plane";
import { StatusBadge } from "@/components/status-badge";
import { requirePageTenantContext } from "@/lib/auth/page-tenant-context";

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export default async function WorkersPage() {
  const context = await requirePageTenantContext();
  const controlPlane = await getControlPlane();
  const [workers, runs] = await Promise.all([controlPlane.listWorkers(context), controlPlane.listRuns(context)]);
  const runsByWorker = new Map<string, typeof runs>();
  for (const run of runs) runsByWorker.set(run.workerId, [...(runsByWorker.get(run.workerId) ?? []), run]);
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  return <div className="mx-auto max-w-6xl"><div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Workers</p><h1 className="mt-2 text-3xl font-black">Your AI workforce</h1><p className="muted mt-2">Every worker has explicit authority, version history, and an observable run record.</p></div><Link href="/workers/new" className="button"><Plus size={17} />Create worker</Link></div>
    {workers.length ? <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--line)] bg-white"><div className="hidden grid-cols-[1.6fr_.7fr_1fr_.85fr_auto] gap-4 border-b border-[var(--line)] px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--muted)] md:grid"><span>Worker</span><span>Status</span><span>Latest run</span><span>Est. cost this month</span><span /></div>
      {workers.map((worker) => {
        const workerRuns = runsByWorker.get(worker.id) ?? [];
        const latestRun = [...workerRuns].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
        const currentMonthRuns = workerRuns.filter((run) => new Date(run.createdAt) >= monthStart);
        const monthlyCost = currentMonthRuns.reduce((sum, run) => sum + run.estimatedCostUsd, 0);
        return <Link key={worker.id} href={`/workers/${worker.id}`} className="grid gap-3 border-b border-[var(--line)] px-5 py-5 last:border-0 hover:bg-slate-50 md:grid-cols-[1.6fr_.7fr_1fr_.85fr_auto] md:items-center"><div><p className="font-extrabold">{worker.name}</p><p className="muted mt-1 line-clamp-1 text-sm">{worker.versions.at(-1)?.spec.objective}</p></div><div><StatusBadge status={worker.status} /></div><div>{latestRun ? <><p className="text-sm font-bold">{latestRun.mode === "dry_run" ? "Safe test" : "Live run"}</p><p className="muted mt-1 text-xs">{dateTime.format(new Date(latestRun.createdAt))}</p></> : <span className="muted text-sm">—</span>}</div><span className="text-sm font-bold">{currentMonthRuns.length ? `$${monthlyCost.toFixed(4)}` : "—"}</span><ArrowRight size={17} className="text-[var(--muted)]" /></Link>;
      })}
    </div> : <div className="card mt-8 flex min-h-72 flex-col items-center justify-center p-8 text-center"><h2 className="text-xl font-black">No workers yet</h2><p className="muted mt-2 max-w-md text-sm leading-6">Describe an outcome to create a reviewable, default-deny worker draft.</p><Link href="/workers/new" className="button mt-5"><Plus size={16} />Create worker</Link></div>}</div>;
}
