import Link from "next/link";
import { ArrowRight, ShieldCheck, Workflow } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow">Control plane</p><h1 className="mt-2 text-3xl font-black tracking-tight">Good morning</h1><p className="muted mt-2">Create, govern, and observe your persistent workers.</p></div>
        <Link href="/workers/new" className="button">Create worker <ArrowRight size={16} /></Link>
      </div>
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {[["Active workers", "0", Workflow], ["Runs this month", "0", ArrowRight], ["Pending approvals", "0", ShieldCheck]].map(([label, value, Icon]) => {
          const ItemIcon = Icon as typeof Workflow;
          return <div key={String(label)} className="card p-5"><div className="flex items-center justify-between"><p className="muted text-sm font-semibold">{String(label)}</p><ItemIcon size={18} className="text-[var(--accent)]" /></div><p className="mt-5 text-3xl font-black">{String(value)}</p></div>;
        })}
      </section>
      <section className="card mt-6 grid gap-8 p-7 md:grid-cols-[1fr_auto] md:items-center">
        <div><p className="eyebrow">Start with an outcome</p><h2 className="mt-3 text-2xl font-black">Hire your first AI worker</h2><p className="muted mt-3 max-w-2xl leading-7">Describe a job in plain language. You will review its tools, authority, budget, and proposed trigger before anything is deployed.</p></div>
        <Link href="/workers/new" className="button button-secondary">Describe the job <ArrowRight size={16} /></Link>
      </section>
    </div>
  );
}
