"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, PlugZap } from "lucide-react";

const connectionErrors: Record<string, string> = {
  INTEGRATION_CONFIGURATION_REQUIRED: "OAuth is not configured by this AgentCloud operator.",
  INTEGRATION_CONNECTION_FAILED: "The secure connection could not be started. Try again.",
};

export function IntegrationCard({ provider, name, description, demo, configured, missingConfiguration, status, displayName }: { provider: string; name: string; description: string; demo: boolean; configured: boolean; missingConfiguration?: readonly string[]; status?: string; displayName?: string }) {
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function connect() {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/integrations/${provider}/connect`, { method: "POST" });
      const body = await response.json() as { redirectUrl?: string; connected?: boolean; code?: string };
      if (!response.ok) { setError(connectionErrors[body.code ?? ""] ?? "The connection could not be started."); return; }
      if (body.redirectUrl) window.location.assign(body.redirectUrl);
    } catch { setError("The connection could not be started."); }
    finally { setPending(false); }
  }
  const active = status === "CONNECTED" && configured;
  return <article className="card p-6"><div className="flex items-start justify-between"><div className="rounded-xl bg-[var(--accent-soft)] p-3 text-[var(--accent)]"><PlugZap size={23} /></div>{active ? <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-700"><CheckCircle2 size={15} />Connected</span> : !configured && <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-700"><CircleAlert size={15} />Setup required</span>}</div><h2 className="mt-5 text-lg font-black">{demo ? "Demo " : ""}{name}</h2><p className="muted mt-2 text-sm leading-6">{description}</p>{active ? <p className="mt-5 text-xs font-bold text-[var(--muted)]">{displayName ?? (demo ? "Deterministic demo adapter" : "Connected account")}</p> : configured ? <button onClick={connect} disabled={pending} className="button mt-5 w-full">{pending ? <LoaderCircle className="animate-spin" size={16} /> : <PlugZap size={16} />}Connect securely</button> : <p className="mt-5 text-xs font-bold leading-5 text-amber-800">Operator configuration needed: {(missingConfiguration ?? []).join(" + ")}</p>}{error && <p role="alert" className="mt-3 text-xs font-bold text-red-700">{error}</p>}</article>;
}
