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

## Local demo setup

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Keep `DEMO_MODE=true` for deterministic fake Gmail, HubSpot, Slack, model, and runtime adapters. Demo mode is explicit and never used as a production fallback.

## Production service setup

1. Create a PostgreSQL/Neon database and set `DATABASE_URL`; run `pnpm db:migrate`.
2. Create a Clerk application, enable Organizations, add the publishable/secret keys, and enable OAuth Provider dynamic client registration for MCP. Configure default scopes for hosts that omit them.
3. Create Trigger.dev development/production environments, set `TRIGGER_SECRET_KEY` and `TRIGGER_PROJECT_REF`, then deploy the task configuration.
4. Create Composio auth configurations for Gmail, HubSpot, and Slack, and set their IDs plus `COMPOSIO_API_KEY`. AgentCloud stores connected-account references only.
5. Set `OPENAI_API_KEY`, `WORKER_COMPILER_MODEL`, and `WORKER_MODEL`.
6. Set `APP_BASE_URL` and a strong `WEBHOOK_SIGNING_SECRET`.

Exact variables and safe defaults are documented in `.env.example`. Set `DEMO_MODE=false` and `NEXT_PUBLIC_DEMO_MODE=false` in production.

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
```

## MCP connection

The remote endpoint is `/api/mcp`. In production it advertises Clerk OAuth metadata and requires a token with an active organization. Configure an MCP host with `https://YOUR_DOMAIN/api/mcp`; dynamic registration and authorization are handled by Clerk. Demo lifecycle tests use the v2 MCP client in-process and never expose secrets.

## Deployment

Deploy the Next.js application to Vercel with the production environment variables, migrate the production database from a controlled release job, and deploy Trigger.dev tasks from the same Git revision. Vercel hosts the UI/API/MCP endpoint; Trigger.dev continues scheduled and waiting work independently of the initiating MCP conversation.

No deployment is claimed by this repository alone. Vendor account creation, OAuth consent, production database migration, DNS, and secret configuration are manual credentialed steps.

## Known MVP limitations

- Gmail, HubSpot, and Slack are the only supported integration families.
- Financial, destructive, bulk, arbitrary MCP, browser, shell, and user-code tools are intentionally unavailable.
- OpenAI is the sole real model provider in the MVP, although the internal model boundary is provider-neutral.
- Ambiguous write outcomes require manual reconciliation rather than automatic retry.
