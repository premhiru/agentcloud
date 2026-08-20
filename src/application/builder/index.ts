import "server-only";

import { and, eq } from "drizzle-orm";

import { FakeCompilerModel } from "@/application/compiler/compiler";
import { DemoBuilderProposalCommitter } from "@/application/builder/demo-committer";
import { BuilderService } from "@/application/builder/service";
import { MemoryBuilderSessionRepository } from "@/application/builder/session";
import { getDatabase } from "@/db/client";
import { connections } from "@/db/schema";
import type { IntegrationProvider } from "@/domain/tool-registry";
import { isDemoMode, type TenantContext } from "@/lib/auth/tenant-context";
import { resolveTenantIds } from "@/lib/auth/tenant-ids";
import { OpenAICompilerModel } from "@/models/openai-adapters";
import { PostgresBuilderProposalCommitter } from "@/persistence/postgres-builder-committer";
import { PostgresBuilderSessionRepository } from "@/persistence/postgres-builder-repository";

const demoRepository = new MemoryBuilderSessionRepository();
const demoService = new BuilderService(
  demoRepository,
  new FakeCompilerModel(),
  async () => ["gmail", "hubspot", "slack"],
);

export type BuilderApplication = Readonly<{
  organizationId: string;
  userId: string;
  service: BuilderService;
  committer: DemoBuilderProposalCommitter | PostgresBuilderProposalCommitter;
}>;

export async function getBuilderApplication(context: TenantContext): Promise<BuilderApplication> {
  if (isDemoMode()) {
    return {
      organizationId: context.organizationExternalId,
      userId: context.userExternalId,
      service: demoService,
      committer: new DemoBuilderProposalCommitter(demoRepository, context),
    };
  }

  const tenant = await resolveTenantIds(context);
  const database = getDatabase();
  const repository = new PostgresBuilderSessionRepository(database);
  const service = new BuilderService(
    repository,
    new OpenAICompilerModel(),
    async (organizationId) => {
      const rows = await database
        .select({ provider: connections.provider })
        .from(connections)
        .where(and(
          eq(connections.organizationId, organizationId),
          eq(connections.status, "CONNECTED"),
        ));
      return rows.map(({ provider }) => provider as IntegrationProvider);
    },
  );

  return {
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    service,
    committer: new PostgresBuilderProposalCommitter(database),
  };
}
