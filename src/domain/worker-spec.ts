import { z } from "zod";

const safeText = (label: string, max = 10_000) => z.string().trim().min(1, `${label} is required`).max(max);

export const manualTriggerSchema = z.object({ type: z.literal("manual") }).strict();
export const scheduleTriggerSchema = z
  .object({
    type: z.literal("schedule"),
    cron: z.string().trim().regex(/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/, "Use a five-field cron expression"),
    timezone: z.string().trim().min(1).max(100),
  })
  .strict();
export const webhookTriggerSchema = z
  .object({ type: z.literal("webhook"), key: z.string().trim().min(3).max(80).regex(/^[a-z0-9_-]+$/) })
  .strict();
export const triggerSpecSchema = z.discriminatedUnion("type", [
  manualTriggerSchema,
  scheduleTriggerSchema,
  webhookTriggerSchema,
]);

export const capabilityGrantSchema = z
  .object({ capability: z.string().trim().min(3).max(120) })
  .strict();

export const authorityConstraintsSchema = z
  .object({
    maxPerDay: z.number().int().positive().max(10_000).optional(),
    allowedDomains: z.array(z.string().trim().toLowerCase().min(1).max(253)).max(100).optional(),
    blockedDomains: z.array(z.string().trim().toLowerCase().min(1).max(253)).max(100).optional(),
  })
  .strict();

export const authorityRuleSchema = z
  .object({
    capability: z.string().trim().min(3).max(120),
    effect: z.enum(["allow", "deny", "require_approval"]),
    constraints: authorityConstraintsSchema.optional(),
  })
  .strict();

export const workerSpecSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    identity: z.object({ name: safeText("Worker name", 100), description: safeText("Description", 500) }).strict(),
    objective: safeText("Objective", 2_000),
    instructions: z.array(safeText("Instruction", 2_000)).min(1).max(50),
    model: z
      .object({
        provider: z.literal("openai"),
        model: z.string().trim().min(1).max(120),
        maxSteps: z.number().int().min(1).max(25),
      })
      .strict(),
    triggers: z.array(triggerSpecSchema).min(1).max(10),
    capabilities: z.array(capabilityGrantSchema).max(50),
    authority: z
      .object({ defaultEffect: z.literal("deny"), rules: z.array(authorityRuleSchema).max(100) })
      .strict(),
    budget: z
      .object({
        monthlyUsd: z.number().nonnegative().max(100_000),
        perRunUsd: z.number().positive().max(10_000),
        maxModelCallsPerRun: z.number().int().positive().max(100),
        maxToolCallsPerRun: z.number().int().positive().max(500),
      })
      .strict(),
    memory: z.object({ enabled: z.boolean(), retentionDays: z.number().int().min(1).max(365) }).strict(),
    failurePolicy: z
      .object({ maxTransientRetries: z.number().int().min(0).max(10), onFailure: z.enum(["stop", "notify_owner"]) })
      .strict(),
    notifications: z.object({ notifyOnFailure: z.boolean(), notifyOnApproval: z.boolean() }).strict(),
  })
  .strict()
  .superRefine((spec, context) => {
    const grants = new Set<string>();
    for (const [index, grant] of spec.capabilities.entries()) {
      if (grants.has(grant.capability)) {
        context.addIssue({ code: "custom", message: "Capability grants must be unique", path: ["capabilities", index] });
      }
      grants.add(grant.capability);
    }
    const rules = new Set<string>();
    for (const [index, rule] of spec.authority.rules.entries()) {
      if (rules.has(rule.capability)) {
        context.addIssue({ code: "custom", message: "Authority rules must be unique", path: ["authority", "rules", index] });
      }
      if (!grants.has(rule.capability)) {
        context.addIssue({ code: "custom", message: "Authority cannot reference an ungranted capability", path: ["authority", "rules", index] });
      }
      rules.add(rule.capability);
    }
  });

export type TriggerSpec = z.infer<typeof triggerSpecSchema>;
export type CapabilityGrant = z.infer<typeof capabilityGrantSchema>;
export type AuthorityRule = z.infer<typeof authorityRuleSchema>;
export type WorkerSpec = z.infer<typeof workerSpecSchema>;

export function parseWorkerSpec(input: unknown): WorkerSpec {
  return workerSpecSchema.parse(input);
}
