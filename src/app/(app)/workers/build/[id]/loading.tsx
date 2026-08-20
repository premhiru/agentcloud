import { LoaderCircle } from "lucide-react";

export default function BuilderLoading() {
  return <div className="mx-auto flex min-h-[55vh] max-w-7xl items-center justify-center" role="status"><div className="card flex items-center gap-3 px-5 py-4 text-sm font-bold"><LoaderCircle className="animate-spin text-[var(--accent)]" size={18} />Opening worker builder…</div></div>;
}
