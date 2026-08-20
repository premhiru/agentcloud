"use client";

import { useState } from "react";
import { LoaderCircle, MessageSquareText } from "lucide-react";
import { useRouter } from "next/navigation";

export function ImproveWorkerButton({ workerId, disabled }: { workerId: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function improveWorker() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/worker-builders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workerId }),
      });
      const body = await response.json() as { builderPath?: string; code?: string };
      if (!response.ok || !body.builderPath) {
        setError(body.code === "OPENAI_API_KEY_REQUIRED"
          ? "Worker design is not configured in this environment. Ask the operator to add the server-side model key."
          : body.code === "RATE_LIMIT_EXCEEDED"
            ? "Please wait a moment before starting another design session."
            : "Unable to start an improvement session. Nothing was changed.");
        return;
      }
      router.push(body.builderPath);
    } catch {
      setError("Unable to start an improvement session");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={improveWorker}
        disabled={disabled || pending}
        title={disabled ? "Archived workers cannot be changed." : undefined}
        className="button button-secondary"
      >
        {pending ? <LoaderCircle className="animate-spin" size={16} /> : <MessageSquareText size={16} />}
        Improve worker
      </button>
      {error ? <p role="alert" className="mt-2 max-w-64 text-sm font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
