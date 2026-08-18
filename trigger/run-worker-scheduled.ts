import { schedules } from "@trigger.dev/sdk";

export const runWorkerScheduledTask = schedules.task({
  id: "run-worker-scheduled",
  run: async (payload) => ({ scheduleId: payload.scheduleId, receivedAt: payload.timestamp.toISOString() }),
});
