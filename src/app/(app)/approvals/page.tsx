import { ShieldCheck } from "lucide-react";

import { demoControlPlane } from "@/application/control-plane/demo-store";
import { ApprovalCard } from "@/components/approval-card";
import { requireTenantContext } from "@/lib/auth/tenant-context";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const context = await requireTenantContext(); const approvals = demoControlPlane.listApprovals(context);
  return <div className="mx-auto max-w-5xl"><p className="eyebrow">Approvals</p><h1 className="mt-2 text-3xl font-black">Human decisions</h1><p className="muted mt-2">Review the exact redacted request before a worker performs an approval-required action.</p>{approvals.length ? <div className="mt-8 space-y-4">{approvals.map((approval) => <ApprovalCard key={approval.id} approval={approval} workerName={demoControlPlane.getWorker(context, approval.workerId)?.name ?? "Worker"} />)}</div> : <div className="card mt-8 flex min-h-72 flex-col items-center justify-center p-8 text-center"><div className="rounded-full bg-[var(--accent-soft)] p-4 text-[var(--accent)]"><ShieldCheck size={30} /></div><h2 className="mt-5 text-xl font-black">Nothing needs your attention</h2><p className="muted mt-2 max-w-md leading-6">When a live worker requests a governed action, its exact payload and reason will appear here.</p></div>}</div>;
}
