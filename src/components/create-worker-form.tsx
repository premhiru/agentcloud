"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";

type StartBuilderResponse = {
  session?: { id: string };
  builderPath?: string;
  code?: string;
};

function errorMessage(code?: string): string {
  if (code === "RATE_LIMIT_EXCEEDED") return "You have started several builders recently. Wait a moment, then try again.";
  if (code === "VALIDATION_FAILED") return "Describe the outcome in at least 10 characters.";
  return "We could not start the builder. Your input was not lost; please try again.";
}

export function CreateWorkerForm() {
  const router = useRouter();
  const [objective, setObjective] = useState("Make sure good inbound sales enquiries never fall through the cracks.");
  const [constraints, setConstraints] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const constraintList = constraints
        .split("\n")
        .map((constraint) => constraint.trim())
        .filter(Boolean);
      const response = await fetch("/api/worker-builders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective, ...(constraintList.length ? { constraints: constraintList } : {}) }),
      });
      const body = await response.json().catch(() => ({})) as StartBuilderResponse;
      if (!response.ok || !body.session) {
        setError(errorMessage(body.code));
        return;
      }
      router.push(`/workers/build/${encodeURIComponent(body.session.id)}`);
    } catch {
      setError(errorMessage());
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="card overflow-hidden">
      <div className="border-b border-[var(--line)] bg-[var(--accent-soft)]/60 px-6 py-4 md:px-8">
        <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--accent-strong)]"><Sparkles size={17} />Describe it. AgentCloud will design it.</div>
      </div>
      <div className="p-6 md:p-8">
        <label htmlFor="objective" className="text-sm font-extrabold">What outcome should this worker own?</label>
        <p id="objective-help" className="muted mt-2 text-sm leading-6">Use plain language. Include who it helps and what success looks like; you can refine the design in the next step.</p>
        <textarea
          id="objective"
          aria-describedby="objective-help"
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
          minLength={10}
          maxLength={2000}
          required
          rows={6}
          disabled={pending}
          className="mt-5 w-full resize-y rounded-xl border border-[var(--line)] bg-white p-4 leading-7 shadow-inner outline-none focus:border-[var(--accent)] disabled:opacity-60"
        />
        <label htmlFor="constraints" className="mt-6 block text-sm font-extrabold">Non-negotiables <span className="muted font-medium">(optional)</span></label>
        <p id="constraints-help" className="muted mt-2 text-sm">Add one guardrail per line, such as “Never email outside our company without approval.”</p>
        <textarea
          id="constraints"
          aria-describedby="constraints-help"
          value={constraints}
          onChange={(event) => setConstraints(event.target.value)}
          maxLength={4000}
          rows={3}
          disabled={pending}
          placeholder={"Only process messages labelled Sales\nRequire approval before contacting a lead"}
          className="mt-3 w-full resize-y rounded-xl border border-[var(--line)] bg-white p-4 text-sm leading-6 outline-none focus:border-[var(--accent)] disabled:opacity-60"
        />
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        <div className="mt-6 flex flex-col gap-4 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="muted flex items-start gap-2 text-xs leading-5"><ShieldCheck className="mt-0.5 shrink-0 text-[var(--accent)]" size={16} />Nothing runs or writes during design. Unknown actions stay denied.</p>
          <button disabled={pending || objective.trim().length < 10} className="button shrink-0 disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? <LoaderCircle className="animate-spin" size={17} /> : <ArrowRight size={17} />}
            {pending ? "Designing worker…" : "Design worker"}
          </button>
        </div>
      </div>
    </form>
  );
}
