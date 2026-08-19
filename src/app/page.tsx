import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, Workflow } from "lucide-react";

import { AuthControls } from "@/components/auth-controls";
import { isDemoMode } from "@/lib/env";

export default function HomePage() {
  const clerkEnabled = !isDemoMode() && Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <main>
      <header className="container flex items-center justify-between py-6">
        <Link href="/" className="text-lg font-black tracking-tight">AgentCloud</Link>
        {clerkEnabled ? <AuthControls /> : <Link href="/dashboard" className="button button-secondary">Open dashboard <ArrowRight size={16} /></Link>}
      </header>
      <section className="container grid min-h-[75vh] items-center gap-12 py-16 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <p className="eyebrow mb-5">Persistent workers, governed by you</p>
          <h1 className="max-w-4xl text-5xl font-black leading-[1.02] tracking-[-.045em] md:text-7xl">
            Put reliable AI workers on the job.
          </h1>
          <p className="muted mt-7 max-w-2xl text-lg leading-8">
            Describe the outcome. AgentCloud turns it into a versioned worker with explicit authority,
            safe testing, approvals, budgets, and a durable run history.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/workers/new" className="button">Create a worker <ArrowRight size={17} /></Link>
            <Link href="/dashboard" className="button button-secondary">See the control plane</Link>
          </div>
        </div>
        <div className="card p-6 md:p-8" aria-label="AgentCloud safety model">
          <div className="mb-8 flex items-center justify-between">
            <div><p className="eyebrow">Inbound Sales Worker</p><p className="mt-2 text-xl font-extrabold">Ready for review</p></div>
            <span className="pill"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Draft</span>
          </div>
          <div className="space-y-4">
            {[
              [Workflow, "Reasoning path", "Reads leads, updates CRM, prepares a reply"],
              [ShieldCheck, "Authority", "Email sends require a human approval"],
              [Check, "Test mode", "All writes become visible simulations"],
            ].map(([Icon, title, copy]) => {
              const ItemIcon = Icon as typeof Workflow;
              return <div key={String(title)} className="flex gap-4 rounded-xl border border-[var(--line)] p-4"><ItemIcon className="mt-1 text-[var(--accent)]" size={20} /><div><p className="font-bold">{String(title)}</p><p className="muted mt-1 text-sm leading-6">{String(copy)}</p></div></div>;
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
