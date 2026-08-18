"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";

export function CreateWorkerForm() {
  const router = useRouter();
  const [objective, setObjective] = useState("Make sure good inbound sales enquiries never fall through the cracks.");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setPending(true);
    const response = await fetch("/api/workers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objective }) });
    const body = await response.json() as { worker?: { id: string }; code?: string };
    setPending(false);
    if (!response.ok || !body.worker) { setError(body.code ?? "Could not create the worker"); return; }
    router.push(`/workers/${body.worker.id}`); router.refresh();
  }

  return (
    <form onSubmit={submit} className="card p-6 md:p-8">
      <label htmlFor="objective" className="text-sm font-extrabold">What job should this worker own?</label>
      <p className="muted mt-2 text-sm">Describe the outcome in plain language. You will review every capability and authority rule before deployment.</p>
      <textarea id="objective" value={objective} onChange={(event) => setObjective(event.target.value)} minLength={10} maxLength={2000} required rows={7} className="mt-5 w-full resize-y rounded-xl border border-[var(--line)] bg-white p-4 leading-7 shadow-inner" />
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
      <div className="mt-5 flex items-center justify-between gap-4"><p className="muted text-xs">Default authority is deny. External email requires approval.</p><button disabled={pending} className="button disabled:cursor-wait disabled:opacity-60">{pending ? <LoaderCircle className="animate-spin" size={17} /> : <ArrowRight size={17} />}{pending ? "Compiling…" : "Create draft"}</button></div>
    </form>
  );
}
