import "server-only";

import { wait } from "@trigger.dev/sdk";
import type { ApprovalWaitpoints } from "./types";

export class TriggerApprovalWaitpoints implements ApprovalWaitpoints {
  async create(input: Parameters<ApprovalWaitpoints["create"]>[0]) {
    const token = await wait.createToken({ idempotencyKey: input.idempotencyKey, timeout: input.expiresAt.toISOString(), tags: input.tags });
    return { id: token.id };
  }
  async complete(id: string, output: Parameters<ApprovalWaitpoints["complete"]>[1]) { await wait.completeToken(id, output); }
}
