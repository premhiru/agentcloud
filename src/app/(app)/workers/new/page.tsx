import { CreateWorkerForm } from "@/components/create-worker-form";

export default function NewWorkerPage() {
  return <div className="mx-auto max-w-3xl"><p className="eyebrow">New worker</p><h1 className="mt-2 text-4xl font-black tracking-tight">Start with the outcome</h1><p className="muted mb-8 mt-3 max-w-2xl leading-7">AgentCloud will compile a reviewable WorkerSpec using only curated capabilities. Nothing is deployed or written while creating a draft.</p><CreateWorkerForm /></div>;
}
