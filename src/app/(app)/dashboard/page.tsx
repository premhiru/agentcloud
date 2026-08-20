import Link from "next/link";
import { ArrowRight, ListTree, Plus, ShieldCheck, Workflow } from "lucide-react";

import { getControlPlane } from "@/application/control-plane";
import { StatusBadge } from "@/components/status-badge";
import { requirePageTenantContext } from "@/lib/auth/page-tenant-context";

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export default async function DashboardPage() {
  const context = await requirePageTenantContext();
  const controlPlane = await getControlPlane();
  const [workers, runs, approvals] = await Promise.all([controlPlane.listWorkers(context), controlPlane.listRuns(context), controlPlane.listApprovals(context)]);
  const pendingApprovals = approvals.filter((approval) => approval.status === "PENDING").length;
  const latestRuns = new Map<string, (typeof runs)[number]>();
  for (const run of [...runs].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))) {
    if (!latestRuns.has(run.workerId)) latestRuns.set(run.workerId, run);
  }
  const recentWorkers = [...workers].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, 4);
  const metrics = [
    { label: "Active workers", value: workers.filter((worker) => worker.status === "DEPLOYED").length, icon: Workflow, href: "/workers" },
    { label: "Runs", value: runs.length, icon: ListTree, href: "/runs" },
    { label: "Pending approvals", value: pendingApprovals, icon: ShieldCheck, href: "/approvals" },
  ] as const;
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow">Control plane</p><h1 className="mt-2 text-3xl font-black tracking-tight">Good morning</h1><p className="muted mt-2">Create, govern, and observe your persistent workers.</p></div>
        <Link href="/workers/new" className="button">Create worker <ArrowRight size={16} /></Link>
      </div>
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {metrics.map(({ label, value, icon: ItemIcon, href }) => <Link key={label} href={href} className="card p-5 transition hover:-translate-y-0.5 hover:border-[var(--accent)]"><div className="flex items-center justify-between"><p className="muted text-sm font-semibold">{label}</p><ItemIcon size={18} className="text-[var(--accent)]" /></div><div className="mt-5 flex items-end justify-between"><p className="text-3xl font-black">{value}</p><ArrowRight size={16} className="text-[var(--muted)]" /></div></Link>)}
      </section>
      {workers.length ? (
        <section className="card mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] p-6">
            <div><p className="eyebrow">Workspace</p><h2 className="mt-2 text-xl font-black">Your workers</h2></div>
            <div className="flex gap-2"><Link href="/workers" className="button button-secondary">View all</Link><Link href="/workers/new" className="button"><Plus size={16} />Create worker</Link></div>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {recentWorkers.map((worker) => {
              const latestRun = latestRuns.get(worker.id);
              return <Link key={worker.id} href={`/workers/${worker.id}`} className="grid gap-3 p-5 hover:bg-slate-50 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="font-extrabold">{worker.name}</p><p className="muted mt-1 line-clamp-1 text-sm">{worker.versions.at(-1)?.spec.objective}</p></div><StatusBadge status={worker.status} /><div className="min-w-40 sm:text-right"><p className="muted text-xs font-bold uppercase tracking-wider">Latest run</p><p className="mt-1 text-sm font-semibold">{latestRun ? dateTime.format(new Date(latestRun.createdAt)) : "—"}</p></div></Link>;
            })}
          </div>
        </section>
      ) : (
        <section className="card mt-6 grid gap-8 p-7 md:grid-cols-[1fr_auto] md:items-center">
          <div><p className="eyebrow">Start with an outcome</p><h2 className="mt-3 text-2xl font-black">Hire your first AI worker</h2><p className="muted mt-3 max-w-2xl leading-7">Describe a job in plain language. You will review its tools, authority, budget, and proposed trigger before anything is deployed.</p></div>
          <Link href="/workers/new" className="button button-secondary">Describe the job <ArrowRight size={16} /></Link>
        </section>
      )}
    </div>
  );
}
