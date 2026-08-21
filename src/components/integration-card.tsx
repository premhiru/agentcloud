"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, PlugZap } from "lucide-react";

const connectionErrors: Record<string, string> = {
  INTEGRATION_CONFIGURATION_REQUIRED: "OAuth is not configured by this AgentCloud operator.",
  INTEGRATION_CONNECTION_FAILED: "The secure connection could not be started. Try again.",
};

export function IntegrationCard({ provider, name, description, demo, configured, missingConfiguration, status, displayName, method, returnTo, highlighted, supportedCapabilities, totalCapabilities }: { provider: string; name: string; description: string; demo: boolean; configured: boolean; missingConfiguration?: readonly string[]; status?: string; displayName?: string; method?: string; returnTo?: string; highlighted?: boolean; supportedCapabilities?: number; totalCapabilities?: number }) {
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function connect() {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/integrations/${provider}/connect`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ returnTo }) });
      const body = await response.json() as { redirectUrl?: string; connected?: boolean; code?: string };
      if (!response.ok) { setError(connectionErrors[body.code ?? ""] ?? "The connection could not be started."); return; }
      if (body.redirectUrl) window.location.assign(body.redirectUrl);
    } catch { setError("The connection could not be started."); }
    finally { setPending(false); }
  }
  const active = status === "CONNECTED" && configured;
  const partial = active && supportedCapabilities !== undefined && totalCapabilities !== undefined && supportedCapabilities < totalCapabilities;
  return <article id={`connection-${provider}`} className={`card scroll-mt-24 p-6 ${highlighted ? "ring-2 ring-[var(--accent)] ring-offset-2" : ""}`}><div className="flex items-start justify-between"><div className="rounded-xl bg-[var(--accent-soft)] p-3 text-[var(--accent)]"><PlugZap size={23} /></div>{active ? <span className={`inline-flex items-center gap-1.5 text-xs font-extrabold ${partial ? "text-amber-700" : "text-emerald-700"}`}>{partial ? <CircleAlert size={15} /> : <CheckCircle2 size={15} />}{partial ? "Partially ready" : "Connected"}</span> : !configured && <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-700"><CircleAlert size={15} />Setup required</span>}</div><h2 className="mt-5 text-lg font-black">{demo ? "Demo " : ""}{name}</h2><p className="muted mt-2 text-sm leading-6">{description}</p><p className="mt-3 text-xs font-extrabold text-[var(--accent-strong)]">{demo ? "Credential-free fixture" : method === "official_mcp" ? "Official remote MCP · OAuth" : method === "managed_oauth" ? "Managed OAuth fallback" : "Official MCP or managed OAuth"}</p>{active ? <div className="mt-5 text-xs font-bold text-[var(--muted)]"><p>{displayName ?? (demo ? "Deterministic demo adapter" : "Connected account")}</p>{supportedCapabilities !== undefined && totalCapabilities !== undefined ? <p className="mt-2">{supportedCapabilities} of {totalCapabilities} AgentCloud capabilities ready</p> : null}{partial ? <button onClick={connect} disabled={pending} className="button button-secondary mt-4 w-full">Add missing capability access</button> : null}</div> : configured ? <button onClick={connect} disabled={pending} className="button mt-5 w-full">{pending ? <LoaderCircle className="animate-spin" size={16} /> : <PlugZap size={16} />}{highlighted ? `Connect ${name} for this worker` : "Connect securely"}</button> : <p className="mt-5 text-xs font-bold leading-5 text-amber-800">Operator configuration needed: {(missingConfiguration ?? []).join(" + ")}</p>}{error && <p role="alert" className="mt-3 text-xs font-bold text-red-700">{error}</p>}</article>;
}
