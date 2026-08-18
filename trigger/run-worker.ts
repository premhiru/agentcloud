import { task } from "@trigger.dev/sdk";
import { z } from "zod";

const payloadSchema = z.object({ organizationId: z.string().min(1), workerId: z.string().min(1), workerVersionId: z.string().min(1), runId: z.string().min(1), mode: z.enum(["dry_run", "live"]), trigger: z.object({ type: z.enum(["manual", "schedule", "webhook"]), payload: z.record(z.string(), z.unknown()) }).strict() }).strict();

export const runWorkerTask = task({
  id: "run-worker",
  retry: { maxAttempts: 1 },
  run: async (payload: z.infer<typeof payloadSchema>) => {
    const validated = payloadSchema.parse(payload);
    const { executeWorkerTask } = await import("../src/runtime/worker-task-handler");
    return executeWorkerTask(validated);
  },
});
