import { BuilderWorkspace } from "@/components/builder-workspace";

export default async function WorkerBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BuilderWorkspace sessionId={id} />;
}
