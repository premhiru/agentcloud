"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, X } from "lucide-react";

import type { UiApproval } from "@/application/control-plane/demo-store";
import { StatusBadge } from "./status-badge";

function utcTimestamp(value: string): string {
  return `${new Date(value).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function ApprovalCard({ approval, workerName }: { approval: UiApproval; workerName: string }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function decide(decision: "approve" | "reject") { setPending(true); setError(""); const response = await fetch(`/api/approvals/${approval.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) }); const body = await response.json() as { code?: string }; setPending(false); if (!response.ok) setError(body.code ?? "Decision failed"); else router.refresh(); }
  return <article data-run-id={approval.runId} className="card p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">{workerName}</p><h2 className="mt-2 text-lg font-black">{approval.capabilityId}</h2><p className="muted mt-2 text-sm">{approval.reason}</p></div><StatusBadge status={approval.status} /></div><pre className="mt-5 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">{JSON.stringify(approval.preview, null, 2)}</pre><p className="muted mt-3 text-xs">Requested {utcTimestamp(approval.requestedAt)} · Expires {utcTimestamp(approval.expiresAt)}</p>{approval.status === "PENDING" && <div className="mt-5 flex gap-2"><button disabled={pending} onClick={() => decide("approve")} className="button">{pending ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />}Approve exact request</button><button disabled={pending} onClick={() => decide("reject")} className="button button-secondary"><X size={16} />Reject</button></div>}{error && <p role="alert" className="mt-3 text-sm font-bold text-red-700">{error}</p>}</article>;
}
