"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto max-w-xl py-16"><div className="card p-8 text-center"><TriangleAlert className="mx-auto text-amber-600" size={30} /><h1 className="mt-4 text-2xl font-black">This view could not be loaded</h1><p className="muted mt-3 text-sm leading-6">No worker action was performed. Check the service configuration or try the request again.</p><button onClick={reset} className="button mx-auto mt-6"><RotateCcw size={16} />Try again</button></div></div>;
}
