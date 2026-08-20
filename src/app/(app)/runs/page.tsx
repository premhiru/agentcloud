import Link from "next/link";
import { ArrowRight, ListTree } from "lucide-react";

import { getControlPlane } from "@/application/control-plane";
import { StatusBadge } from "@/components/status-badge";
import { requirePageTenantContext } from "@/lib/auth/page-tenant-context";

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export default async function RunsPage() {
  const context = await requirePageTenantContext();
  const controlPlane = await getControlPlane();
  const [runs, workers] = await Promise.all([controlPlane.listRuns(context), controlPlane.listWorkers(context)]);
  const workerNames = new Map(workers.map((worker) => [worker.id, worker.name]));
  const sortedRuns = [...runs].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <p className="eyebrow">Runs</p>
        <h1 className="mt-2 text-3xl font-black">Operational history</h1>
        <p className="muted mt-2">Inspect live runs and safe tests across every worker in this workspace.</p>
      </div>
      {sortedRuns.length ? (
        <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
          <div className="hidden grid-cols-[1.2fr_1.4fr_.85fr_1fr_.7fr_auto] gap-4 border-b border-[var(--line)] px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--muted)] md:grid">
            <span>Run</span><span>Worker</span><span>Status</span><span>Started</span><span>Est. cost</span><span />
          </div>
          {sortedRuns.map((run) => (
            <Link key={run.id} href={`/runs/${run.id}`} className="grid gap-3 border-b border-[var(--line)] px-5 py-5 last:border-0 hover:bg-slate-50 md:grid-cols-[1.2fr_1.4fr_.85fr_1fr_.7fr_auto] md:items-center">
              <div><p className="font-extrabold">{run.mode === "dry_run" ? "Safe test" : "Live run"}</p><p className="muted mt-1 font-mono text-xs">{run.id.slice(0, 8)}</p></div>
              <p className="text-sm font-bold">{workerNames.get(run.workerId) ?? "Archived worker"}</p>
              <div><StatusBadge status={run.status} /></div>
              <time className="muted text-sm" dateTime={run.createdAt}>{dateTime.format(new Date(run.createdAt))}</time>
              <span className="text-sm font-bold">${run.estimatedCostUsd.toFixed(4)}</span>
              <ArrowRight size={17} className="text-[var(--muted)]" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="card mt-8 flex min-h-72 flex-col items-center justify-center p-8 text-center">
          <ListTree size={30} className="text-[var(--accent)]" />
          <h2 className="mt-4 text-xl font-black">No runs yet</h2>
          <p className="muted mt-2 max-w-md text-sm leading-6">Open a worker and run a safe test. Its complete operational timeline will appear here.</p>
          <Link href="/workers" className="button button-secondary mt-5">Choose a worker <ArrowRight size={16} /></Link>
        </div>
      )}
    </div>
  );
}
