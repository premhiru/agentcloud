import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, CircleDot } from "lucide-react";

import { getControlPlane } from "@/application/control-plane";
import { RunStatusPoller } from "@/components/run-status-poller";
import { StatusBadge } from "@/components/status-badge";
import { requirePageTenantContext } from "@/lib/auth/page-tenant-context";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const context = await requirePageTenantContext(); const controlPlane = await getControlPlane(); const run = await controlPlane.getRun(context, id); if (!run) notFound();
  const worker = await controlPlane.getWorker(context, run.workerId);
  return <div className="mx-auto max-w-4xl"><RunStatusPoller status={run.status} /><Link href={`/workers/${run.workerId}`} className="muted inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft size={16} />Back to worker</Link><div className="mt-6 flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">{run.mode === "dry_run" ? "Safe test" : "Live run"}</p><h1 className="mt-2 text-3xl font-black">{worker?.name ?? "Worker run"}</h1><p className="muted mt-2">Run {run.id.slice(0, 8)} · WorkerSpec pinned to {run.workerVersionId.slice(0, 12)}</p></div><StatusBadge status={run.status} /></div>
    {run.mode === "dry_run" && <div className="mt-7 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900">Dry-run safety was active. Reads used demo fixtures and every write was converted into a “would execute” timeline event.</div>}
    <section className="card mt-6 p-6"><div className="flex items-center justify-between"><div><p className="eyebrow">Timeline</p><h2 className="mt-2 text-xl font-black">What the worker did</h2></div><p className="muted text-sm">Estimated cost ${run.estimatedCostUsd.toFixed(4)}</p></div><ol className="mt-6">{run.steps.map((step, index) => <li key={step.sequence} className="relative flex gap-4 pb-7 last:pb-0">{index < run.steps.length - 1 && <span className="absolute left-[9px] top-6 h-[calc(100%-1rem)] w-px bg-[var(--line)]" />}<span className="relative z-10 mt-1 bg-white text-[var(--accent)]">{step.status === "SUCCEEDED" ? <CheckCircle2 size={19} /> : <CircleDot size={19} />}</span><div><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">{step.summary}</p><span className="muted text-xs">{new Date(step.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></div><p className="muted mt-1 text-xs uppercase tracking-wider">{step.type.replaceAll("_", " ")}</p></div></li>)}</ol></section></div>;
}
