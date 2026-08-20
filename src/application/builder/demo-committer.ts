import { demoControlPlane } from "@/application/control-plane/demo-store";
import type { TenantContext } from "@/lib/auth/tenant-context";
import {
  type BuilderCommitResult,
  type BuilderProposalCommitter,
  type CommitBuilderProposalInput,
  MemoryBuilderSessionRepository,
} from "./session";

export class DemoBuilderProposalCommitter implements BuilderProposalCommitter {
  constructor(
    private readonly repository: MemoryBuilderSessionRepository,
    private readonly context: TenantContext,
  ) {}

  async commit(input: CommitBuilderProposalInput): Promise<BuilderCommitResult> {
    return this.repository.commitWith(input, (proposal, session) => {
      const committed = demoControlPlane.commitWorkerProposal(this.context, {
        workerId: session.workerId,
        spec: proposal.spec,
        specHash: proposal.specHash,
        ready: proposal.readiness.ready,
      });
      return {
        workerId: committed.worker.id,
        workerVersionId: committed.workerVersionId,
        versionNumber: committed.versionNumber,
        createdWorker: committed.createdWorker,
      };
    });
  }
}
