import { LoaderCircle } from "lucide-react";

export default function AppLoading() {
  return <div className="mx-auto flex min-h-[45vh] max-w-6xl items-center justify-center" role="status"><div className="card flex items-center gap-3 px-5 py-4 text-sm font-bold"><LoaderCircle className="animate-spin text-[var(--accent)]" size={18} />Loading AgentCloud…</div></div>;
}
