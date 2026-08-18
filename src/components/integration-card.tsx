"use client";

import { useState } from "react";
import { CheckCircle2, LoaderCircle, PlugZap } from "lucide-react";

export function IntegrationCard({ provider, name, description, demo, status, displayName }: { provider: string; name: string; description: string; demo: boolean; status?: string; displayName?: string }) {
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function connect() { setPending(true); setError(""); const response = await fetch(`/api/integrations/${provider}/connect`, { method: "POST" }); const body = await response.json() as { redirectUrl?: string; connected?: boolean; code?: string }; setPending(false); if (!response.ok) { setError(body.code ?? "Connection failed"); return; } if (body.redirectUrl) window.location.assign(body.redirectUrl); }
  const active = status === "CONNECTED";
  return <article className="card p-6"><div className="flex items-start justify-between"><div className="rounded-xl bg-[var(--accent-soft)] p-3 text-[var(--accent)]"><PlugZap size={23} /></div>{active && <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-700"><CheckCircle2 size={15} />Connected</span>}</div><h2 className="mt-5 text-lg font-black">{demo ? "Demo " : ""}{name}</h2><p className="muted mt-2 text-sm leading-6">{description}</p>{active ? <p className="mt-5 text-xs font-bold text-[var(--muted)]">{displayName ?? (demo ? "Deterministic demo adapter" : "Connected account")}</p> : <button onClick={connect} disabled={pending} className="button mt-5 w-full">{pending ? <LoaderCircle className="animate-spin" size={16} /> : <PlugZap size={16} />}Connect securely</button>}{error && <p role="alert" className="mt-3 text-xs font-bold text-red-700">{error}</p>}</article>;
}
