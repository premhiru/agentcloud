import { Activity } from "lucide-react";

export default function ActivityPage() {
  return <div className="mx-auto max-w-5xl"><p className="eyebrow">Audit trail</p><h1 className="mt-2 text-3xl font-black">Workspace activity</h1><p className="muted mt-2">Security-sensitive lifecycle changes appear in this append-only record.</p><div className="card mt-8 flex min-h-64 flex-col items-center justify-center p-8 text-center"><Activity size={30} className="text-[var(--accent)]" /><h2 className="mt-4 font-black">No recorded changes yet</h2><p className="muted mt-2 text-sm">Create, deploy, pause, or approve a worker action to add an event.</p></div></div>;
}
