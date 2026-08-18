"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, LoaderCircle, Pause, Play, Rocket, Zap } from "lucide-react";

export function WorkerActions({ workerId, status }: { workerId: string; status: string }) {
  const router = useRouter(); const [pending, setPending] = useState<string>(); const [error, setError] = useState("");
  async function act(action: "test" | "deploy" | "pause" | "resume" | "trigger") {
    setPending(action); setError("");
    const response = await fetch(`/api/workers/${workerId}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    const body = await response.json() as { run?: { id: string }; code?: string };
    setPending(undefined);
    if (!response.ok) { setError(body.code ?? "Action failed"); return; }
    if (body.run) router.push(`/runs/${body.run.id}`); else router.refresh();
  }
  const busy = Boolean(pending);
  return <div><div className="flex flex-wrap gap-2">
    <button onClick={() => act("test")} disabled={busy || status === "ARCHIVED"} className="button button-secondary">{pending === "test" ? <LoaderCircle className="animate-spin" size={16} /> : <FlaskConical size={16} />}Test safely</button>
    {(status === "READY" || status === "DRAFT") && <button onClick={() => act("deploy")} disabled={busy} className="button"><Rocket size={16} />Deploy</button>}
    {status === "DEPLOYED" && <><button onClick={() => act("trigger")} disabled={busy} className="button">{pending === "trigger" ? <LoaderCircle className="animate-spin" size={16} /> : <Zap size={16} />}Run now</button><button onClick={() => act("pause")} disabled={busy} className="button button-secondary"><Pause size={16} />Pause</button></>}
    {status === "PAUSED" && <button onClick={() => act("resume")} disabled={busy} className="button"><Play size={16} />Resume</button>}
  </div>{error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p>}</div>;
}
