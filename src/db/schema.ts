import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").defaultRandom().primaryKey();
const organizationId = () => uuid("organization_id").notNull();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const workerStatusEnum = pgEnum("worker_status", [
  "DRAFT",
  "READY",
  "DEPLOYED",
  "PAUSED",
  "ARCHIVED",
]);
export const runStatusEnum = pgEnum("run_status", [
  "QUEUED",
  "RUNNING",
  "WAITING_FOR_APPROVAL",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "BUDGET_EXCEEDED",
  "OUTCOME_UNKNOWN",
]);
export const runModeEnum = pgEnum("run_mode", ["dry_run", "live"]);
export const approvalStatusEnum = pgEnum("approval_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
]);
export const connectionStatusEnum = pgEnum("connection_status", [
  "CONNECTED",
  "EXPIRED",
  "REVOKED",
  "ERROR",
]);
export const toolExecutionStatusEnum = pgEnum("tool_execution_status", [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "DENIED",
  "DRY_RUN",
  "OUTCOME_UNKNOWN",
]);

export const organizations = pgTable("organizations", {
  id: id(),
  clerkOrganizationId: text("clerk_organization_id").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable("users", {
  id: id(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    organizationId: organizationId().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] })],
);

export const workers = pgTable(
  "workers",
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: workerStatusEnum("status").default("DRAFT").notNull(),
    activeVersionId: uuid("active_version_id"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [index("workers_org_status_idx").on(table.organizationId, table.status)],
);

export const workerVersions = pgTable(
  "worker_versions",
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    specJson: jsonb("spec_json").$type<Record<string, unknown>>().notNull(),
    specHash: text("spec_hash").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    deployedAt: timestamp("deployed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("worker_versions_worker_number_uidx").on(table.workerId, table.versionNumber),
    index("worker_versions_org_worker_idx").on(table.organizationId, table.workerId),
  ],
);

export const connections = pgTable(
  "connections",
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["gmail", "hubspot", "slack"] }).notNull(),
    externalConnectionId: text("external_connection_id").notNull(),
    displayName: text("display_name").notNull(),
    status: connectionStatusEnum("status").notNull(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("connections_org_provider_external_uidx").on(
      table.organizationId,
      table.provider,
      table.externalConnectionId,
    ),
  ],
);

export const workerTriggers = pgTable(
  "worker_triggers",
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
    workerVersionId: uuid("worker_version_id").notNull().references(() => workerVersions.id),
    type: text("type", { enum: ["manual", "schedule", "webhook"] }).notNull(),
    configJson: jsonb("config_json").$type<Record<string, unknown>>().notNull(),
    runtimeTriggerId: text("runtime_trigger_id"),
    deduplicationKey: text("deduplication_key").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("worker_triggers_dedup_uidx").on(table.organizationId, table.deduplicationKey),
    index("worker_triggers_worker_idx").on(table.organizationId, table.workerId),
  ],
);

export const runs = pgTable(
  "runs",
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id").notNull().references(() => workers.id),
    workerVersionId: uuid("worker_version_id").notNull().references(() => workerVersions.id),
    runtimeProvider: text("runtime_provider").notNull(),
    runtimeRunId: text("runtime_run_id"),
    correlationId: text("correlation_id").notNull(),
    mode: runModeEnum("mode").notNull(),
    triggerType: text("trigger_type", { enum: ["manual", "schedule", "webhook"] }).notNull(),
    triggerPayload: jsonb("trigger_payload").$type<Record<string, unknown>>().default({}).notNull(),
    status: runStatusEnum("status").default("QUEUED").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }).default("0").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("runs_correlation_uidx").on(table.correlationId),
    index("runs_org_worker_created_idx").on(table.organizationId, table.workerId, table.createdAt),
  ],
);

export const runSteps = pgTable(
  "run_steps",
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    stepType: text("step_type").notNull(),
    status: text("status").notNull(),
    summary: text("summary").notNull(),
    inputJson: jsonb("input_json").$type<Record<string, unknown>>(),
    outputJson: jsonb("output_json").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("run_steps_run_sequence_uidx").on(table.runId, table.sequence)],
);

export const toolExecutions = pgTable(
  "tool_executions",
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    modelToolCallId: text("model_tool_call_id").notNull(),
    capabilityId: text("capability_id").notNull(),
    requestHash: text("request_hash").notNull(),
    status: toolExecutionStatusEnum("status").notNull(),
    inputJson: jsonb("input_json").$type<Record<string, unknown>>().notNull(),
    outputJson: jsonb("output_json").$type<Record<string, unknown>>(),
    externalReference: text("external_reference"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("tool_executions_run_call_uidx").on(table.runId, table.modelToolCallId),
    index("tool_executions_org_run_idx").on(table.organizationId, table.runId),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id").notNull().references(() => workers.id),
    workerVersionId: uuid("worker_version_id").notNull().references(() => workerVersions.id),
    runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    toolExecutionId: uuid("tool_execution_id").references(() => toolExecutions.id),
    capabilityId: text("capability_id").notNull(),
    redactedInputPreview: jsonb("redacted_input_preview").$type<Record<string, unknown>>().notNull(),
    requestHash: text("request_hash").notNull(),
    reason: text("reason").notNull(),
    status: approvalStatusEnum("status").default("PENDING").notNull(),
    waitpointId: text("waitpoint_id"),
    requestedAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: uuid("decided_by").references(() => users.id),
    comment: text("comment"),
  },
  (table) => [index("approvals_org_status_idx").on(table.organizationId, table.status)],
);

export const memoryItems = pgTable(
  "memory_items",
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
    key: text("key").notNull(),
    valueJson: jsonb("value_json").$type<Record<string, unknown>>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("memory_items_org_worker_idx").on(table.organizationId, table.workerId)],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id").notNull().references(() => workers.id),
    runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    modelCalls: integer("model_calls").default(0).notNull(),
    toolCalls: integer("tool_calls").default(0).notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }).default("0").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("usage_events_org_created_idx").on(table.organizationId, table.createdAt)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id, { onDelete: "cascade" }),
    actorType: text("actor_type", { enum: ["user", "worker", "system", "mcp"] }).notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("audit_events_org_created_idx").on(table.organizationId, table.createdAt)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
    triggerId: uuid("trigger_id").notNull().references(() => workerTriggers.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    receivedAt: createdAt(),
    runId: uuid("run_id").references(() => runs.id),
  },
  (table) => [uniqueIndex("webhook_events_trigger_key_uidx").on(table.triggerId, table.idempotencyKey)],
);

export const runtimeDeployments = pgTable(
  "runtime_deployments",
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
    workerVersionId: uuid("worker_version_id").notNull().references(() => workerVersions.id),
    provider: text("provider").notNull(),
    externalDeploymentId: text("external_deployment_id"),
    status: text("status").notNull(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("runtime_deployments_worker_uidx").on(table.organizationId, table.workerId)],
);
