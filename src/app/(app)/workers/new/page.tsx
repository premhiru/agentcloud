import { CreateWorkerForm } from "@/components/create-worker-form";

export default function NewWorkerPage() {
  return <div className="mx-auto max-w-3xl"><p className="eyebrow">Worker builder</p><h1 className="mt-2 text-4xl font-black tracking-tight">Start with the outcome</h1><p className="muted mb-8 mt-3 max-w-2xl leading-7">AgentCloud turns your goal into a governed worker you can review, refine, and save. Deployment is always a separate, explicit step.</p><CreateWorkerForm /></div>;
}
