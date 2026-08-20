CREATE TYPE "public"."builder_message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."builder_session_status" AS ENUM('OPEN', 'READY', 'COMMITTED', 'ABANDONED');--> statement-breakpoint
CREATE TABLE "builder_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"role" "builder_message_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "builder_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"spec_json" jsonb NOT NULL,
	"spec_hash" text NOT NULL,
	"proposal_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "builder_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"worker_id" uuid,
	"base_worker_version_id" uuid,
	"status" "builder_session_status" DEFAULT 'OPEN' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"committed_worker_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "builder_messages" ADD CONSTRAINT "builder_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_messages" ADD CONSTRAINT "builder_messages_session_id_builder_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."builder_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_proposals" ADD CONSTRAINT "builder_proposals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_proposals" ADD CONSTRAINT "builder_proposals_session_id_builder_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."builder_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_sessions" ADD CONSTRAINT "builder_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_sessions" ADD CONSTRAINT "builder_sessions_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_sessions" ADD CONSTRAINT "builder_sessions_base_worker_version_id_worker_versions_id_fk" FOREIGN KEY ("base_worker_version_id") REFERENCES "public"."worker_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_sessions" ADD CONSTRAINT "builder_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_sessions" ADD CONSTRAINT "builder_sessions_committed_worker_version_id_worker_versions_id_fk" FOREIGN KEY ("committed_worker_version_id") REFERENCES "public"."worker_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "builder_messages_session_sequence_uidx" ON "builder_messages" USING btree ("session_id","sequence");--> statement-breakpoint
CREATE INDEX "builder_messages_org_session_idx" ON "builder_messages" USING btree ("organization_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "builder_proposals_session_revision_uidx" ON "builder_proposals" USING btree ("session_id","revision");--> statement-breakpoint
CREATE INDEX "builder_proposals_org_session_idx" ON "builder_proposals" USING btree ("organization_id","session_id");--> statement-breakpoint
CREATE INDEX "builder_proposals_org_spec_hash_idx" ON "builder_proposals" USING btree ("organization_id","spec_hash");--> statement-breakpoint
CREATE INDEX "builder_sessions_org_status_updated_idx" ON "builder_sessions" USING btree ("organization_id","status","updated_at");