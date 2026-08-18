const tones: Record<string, string> = {
  DEPLOYED: "bg-emerald-100 text-emerald-800", SUCCEEDED: "bg-emerald-100 text-emerald-800", CONNECTED: "bg-emerald-100 text-emerald-800",
  READY: "bg-blue-100 text-blue-800", RUNNING: "bg-blue-100 text-blue-800", DRAFT: "bg-slate-100 text-slate-700",
  PAUSED: "bg-amber-100 text-amber-800", PENDING: "bg-amber-100 text-amber-800", WAITING_FOR_APPROVAL: "bg-amber-100 text-amber-800",
  FAILED: "bg-red-100 text-red-800", REVOKED: "bg-red-100 text-red-800", ARCHIVED: "bg-slate-100 text-slate-600",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${tones[status] ?? "bg-slate-100 text-slate-700"}`}>{status.replaceAll("_", " ")}</span>;
}
