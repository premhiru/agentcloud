"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { History, LoaderCircle, Plus } from "lucide-react";

type VersionSummary = { id: string; versionNumber: number };

export function VersionControls({ workerId, objective, versions, activeVersionId, archived }: { workerId: string; objective: string; versions: VersionSummary[]; activeVersionId?: string; archived: boolean }) {
  const router = useRouter();
  const [nextObjective, setNextObjective] = useState(objective);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState("");

  async function createVersion() {
    setPending("create"); setError("");
    const response = await fetch(`/api/workers/${workerId}/versions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ objective: nextObjective }) });
    const body = await response.json() as { code?: string };
    setPending(undefined);
    if (!response.ok) { setError(body.code ?? "Version creation failed"); return; }
    router.refresh();
  }

  async function rollback(versionId: string) {
    setPending(versionId); setError("");
    const response = await fetch(`/api/workers/${workerId}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "rollback", versionId }) });
    const body = await response.json() as { code?: string };
    setPending(undefined);
    if (!response.ok) { setError(body.code ?? "Rollback failed"); return; }
    router.refresh();
  }

  return <div className="mt-5 space-y-4">
    <div>
      <label htmlFor="next-objective" className="text-sm font-extrabold">Objective for next version</label>
      <textarea id="next-objective" value={nextObjective} onChange={(event) => setNextObjective(event.target.value)} disabled={Boolean(pending) || archived} rows={4} className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white p-3 text-sm leading-6 outline-none focus:border-[var(--accent)]" />
      <button onClick={createVersion} disabled={Boolean(pending) || archived || nextObjective.trim().length < 10} className="button button-secondary mt-3 w-full">
        {pending === "create" ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}Create new version
      </button>
    </div>
    <div className="space-y-2 border-t border-[var(--line)] pt-4">
      {activeVersionId && versions.filter((version) => version.id !== activeVersionId).map((version) => <button key={version.id} onClick={() => rollback(version.id)} disabled={Boolean(pending) || archived} className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-bold hover:border-[var(--accent)] disabled:opacity-50">
        <span>Roll back to version {version.versionNumber}</span>{pending === version.id ? <LoaderCircle className="animate-spin" size={15} /> : <History size={15} />}
      </button>)}
      {(!activeVersionId || versions.length < 2) && <p className="muted text-xs">Deploy a version and keep a second version to enable rollback.</p>}
    </div>
    {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
  </div>;
}
