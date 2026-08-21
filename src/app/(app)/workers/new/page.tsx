import { CreateWorkerForm } from "@/components/create-worker-form";
import { shouldUseLocalFakeModels } from "@/models/model-mode";

export default function NewWorkerPage() {
  const localFixture = shouldUseLocalFakeModels();
  return <div className="mx-auto max-w-3xl"><p className="eyebrow">Worker builder</p><h1 className="mt-2 text-4xl font-black tracking-tight">Start with the outcome</h1><p className="muted mb-8 mt-3 max-w-2xl leading-7">AgentCloud turns your goal into a governed worker you can review, refine, and save. Deployment is always a separate, explicit step.</p>{localFixture ? <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><strong>Local deterministic compiler:</strong> no model credential is configured, so this development server will generate the canonical fixture proposal. Production continues to require a real model credential.</div> : null}<CreateWorkerForm /></div>;
}
