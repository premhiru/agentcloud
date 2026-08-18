# AgentCloud

AgentCloud is a control plane for persistent AI workers. It turns a plain-language objective into a versioned WorkerSpec, makes authority and budgets explicit, supports side-effect-free testing, deploys through an abstract runtime, pauses for human approval, and records a complete operational timeline.

## Status

This repository implements the MVP in `PLAN.md`. `PROGRESS.md` records verified milestone checkpoints and exact validation commands.

## Architecture

The Next.js App Router application serves the dashboard, typed API, and remote MCP endpoint. PostgreSQL/Drizzle stores workers, immutable versions, triggers, runs, approvals, idempotent tool executions, memory, usage, and append-only audit events. Trigger.dev v4 is behind `WorkerRuntime`; Composio is behind `IntegrationAdapter`; AI SDK/OpenAI is behind `ModelProvider`. See `ARCHITECTURE.md` and `SECURITY.md`.

## Prerequisites

- Node.js 24 or later
- pnpm 11
- PostgreSQL 16+ or Neon (unless using the in-memory automated test harness)

## Local deterministic demo

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Keep both demo flags `true`. The demo persists to `.agentcloud/demo-store.json` and uses deterministic Gmail, HubSpot, Slack, model, and runtime adapters. It does not need PostgreSQL or vendor credentials, and exercises create/version/test/deploy/trigger/approval/resume/pause/rollback through the governed runner. Demo mode is explicit and never used as a production fallback.

## Production service setup

1. Create a PostgreSQL/Neon database and set `DATABASE_URL`; run `pnpm db:migrate`.
2. Create a Clerk application, enable Organizations, add the publishable/secret keys, and enable OAuth Provider dynamic client registration for MCP. A user must sign in, select or create an organization, and visit the dashboard once so AgentCloud can create its tenant membership. Configure the seven scopes listed below.
3. Create Trigger.dev development/production environments, set `TRIGGER_SECRET_KEY` and `TRIGGER_PROJECT_REF`, then run `pnpm trigger:deploy` from the same revision as the web deployment.
4. Create Composio auth configurations for Gmail, HubSpot, and Slack, set their IDs plus `COMPOSIO_API_KEY`, and allow `APP_BASE_URL/api/integrations/callback` as a redirect. AgentCloud stores opaque connected-account references only; OAuth tokens remain in Composio.
5. Set `OPENAI_API_KEY`, `WORKER_COMPILER_MODEL`, and `WORKER_MODEL`.
6. Set `APP_BASE_URL` and a strong `WEBHOOK_SIGNING_SECRET`.

Exact variables and safe defaults are documented in `.env.example`. Set `DEMO_MODE=false` and `NEXT_PUBLIC_DEMO_MODE=false` in production. See `DEPLOYMENT.md` for the release and rollback runbook.

## Commands

```bash
pnpm dev               # Next.js development server
pnpm lint              # ESLint
pnpm typecheck         # strict TypeScript
pnpm test              # unit + integration + security + MCP tests
pnpm test:e2e          # Playwright critical journeys
pnpm build             # production build
pnpm db:generate       # generate a reviewed Drizzle migration
pnpm db:migrate        # apply committed migrations
pnpm db:seed           # seed the demo tenant
pnpm trigger:dev       # run Trigger.dev tasks locally
pnpm trigger:deploy    # deploy Trigger.dev tasks
```

## MCP connection

The remote endpoint is `/api/mcp`. In production it advertises Clerk OAuth metadata and requires a token whose Clerk user already has an AgentCloud organization membership. Configure an MCP host with `https://YOUR_DOMAIN/api/mcp`; dynamic registration and authorization are handled by Clerk. The supported scopes are `workers:read`, `workers:write`, `workers:deploy`, `runs:read`, `approvals:read`, `approvals:write`, and `connections:read`. Each tool rechecks its own scope server-side. Demo lifecycle tests use the v2 MCP client in-process and never expose secrets.

## Signed webhooks

A deployed WorkerSpec webhook `{ type: "webhook", key: "lead-intake" }` is exposed at `POST /api/webhooks/workers/{workerId}/lead-intake`. Send the raw-body HMAC-SHA256 in `X-AgentCloud-Signature: sha256=<hex>` using `WEBHOOK_SIGNING_SECRET`, plus a stable `Idempotency-Key`. Requests are capped at 256 KiB, rate-limited, structurally validated, and deduplicated. Reusing a key with a different payload is rejected.

## Deployment

Deploy the Next.js application to Vercel with the production environment variables, migrate the production database from a controlled release job, and deploy Trigger.dev tasks from the same Git revision. Vercel hosts the UI/API/MCP/webhook endpoints; Trigger.dev continues scheduled and waiting work independently of the initiating browser or MCP conversation.

No deployment is claimed by this repository alone. Vendor account creation, OAuth consent, production database migration, DNS, and secret configuration are manual credentialed steps.

## Known MVP limitations

- Gmail, HubSpot, and Slack are the only supported integration families.
- Financial, destructive, bulk, arbitrary MCP, browser, shell, and user-code tools are intentionally unavailable.
- OpenAI is the sole real model provider in the MVP, although the internal model boundary is provider-neutral.
- Ambiguous write outcomes require manual reconciliation rather than automatic retry.
- Production readiness is verified in CI with deterministic adapters; real OAuth consent, Trigger.dev Cloud execution, and Vercel deployment still require the operator-owned credentials described above.
