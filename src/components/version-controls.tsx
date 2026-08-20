"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { History, LoaderCircle } from "lucide-react";

type VersionSummary = { id: string; versionNumber: number };

export function VersionControls({ workerId, versions, activeVersionId, archived }: { workerId: string; versions: VersionSummary[]; activeVersionId?: string; archived: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState("");

  async function rollback(versionId: string) {
    setPending(versionId); setError("");
    const response = await fetch(`/api/workers/${workerId}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "rollback", versionId }) });
    const body = await response.json() as { code?: string };
    setPending(undefined);
    if (!response.ok) { setError(body.code ?? "Rollback failed"); return; }
    router.refresh();
  }

  return <div className="mt-5 space-y-4">
    <div className="space-y-2">
      {activeVersionId && versions.filter((version) => version.id !== activeVersionId).map((version) => <button key={version.id} onClick={() => rollback(version.id)} disabled={Boolean(pending) || archived} className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-bold hover:border-[var(--accent)] disabled:opacity-50">
        <span>Roll back to version {version.versionNumber}</span>{pending === version.id ? <LoaderCircle className="animate-spin" size={15} /> : <History size={15} />}
      </button>)}
      {(!activeVersionId || versions.length < 2) && <p className="muted text-xs">Deploy a version and keep a second version to enable rollback.</p>}
    </div>
    {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
  </div>;
}
