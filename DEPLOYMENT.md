# AgentCloud production deployment

This is an operator runbook. It does not imply that any external environment has been deployed from this repository.

## 1. Provision and configure

Use Node.js 24 and pnpm 11. Create a PostgreSQL 16 or Neon database, a Clerk application with Organizations and OAuth Provider enabled, a Trigger.dev v4 project, an OpenAI API project, and Composio Gmail/HubSpot/Slack auth configurations.

Set every variable in `.env.example` in both the Vercel production environment and, where required by task execution, the Trigger.dev production environment. Production must explicitly use:

```text
DEMO_MODE=false
NEXT_PUBLIC_DEMO_MODE=false
APP_BASE_URL=https://your-agentcloud-domain.example
WEBHOOK_SIGNING_SECRET=<at-least-32-random-bytes>
```

Keep database, Clerk, OpenAI, Trigger.dev, Composio, and signing secrets server-only. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `NEXT_PUBLIC_DEMO_MODE` are the only public configuration values.

In Clerk, grant MCP clients only the scopes they need from: `workers:read`, `workers:write`, `workers:deploy`, `runs:read`, `approvals:read`, `approvals:write`, and `connections:read`. Enable dynamic client registration if the intended MCP host requires it. Each user must select an organization and visit AgentCloud once before their first MCP connection so the membership is synchronized.

In Composio, allow this callback URL for each auth configuration:

```text
https://your-agentcloud-domain.example/api/integrations/callback
```

## 2. Verify the release locally or in CI

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true pnpm build
DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true pnpm test:e2e
```

The deterministic test suite must pass before production credentials are used.

## 3. Release in dependency order

1. Back up the database and apply committed migrations with `pnpm db:migrate` from a controlled one-off release job.
2. Deploy Trigger.dev tasks with `pnpm trigger:deploy`. Confirm both `run-worker` and `run-worker-scheduled` appear in the intended production project.
3. Deploy the same Git revision to Vercel. `vercel.json` selects the Next.js framework and Singapore region; change the region only after considering database latency and residency.
4. Sign in, select/create an organization, connect Gmail/HubSpot/Slack, create a worker, and run a safe test.
5. Deploy and manually trigger the worker. Confirm it enters `WAITING_FOR_APPROVAL`, approve the exact request, and confirm the same run reaches `SUCCEEDED` with one external email step.
6. Connect an OAuth MCP client to `/api/mcp` and repeat the lifecycle with least-privilege scopes.

## 4. Operational checks

- Check `/dashboard`, `/runs/{id}`, `/approvals`, and `/activity` for persisted state and audit events.
- Verify schedule pause/resume in Trigger.dev after pausing/resuming a worker.
- Treat `OUTCOME_UNKNOWN` writes as manual reconciliation events; do not automatically retry them.
- Rotate `WEBHOOK_SIGNING_SECRET` in a coordinated maintenance window because existing senders must update simultaneously.
- Do not enable demo flags in preview or production environments that contain real users.

## 5. Rollback

Application rollback is a Vercel revision rollback paired with the matching Trigger.dev task revision. Database migrations are forward-only: restore from the pre-release backup or apply a reviewed corrective migration rather than editing committed migration history. Worker rollback is separate and available from the worker page or `rollback_worker`; it activates an immutable historical WorkerSpec without changing prior runs.

## Credential-dependent verification still required

Without operator credentials, this repository cannot claim real Clerk OAuth consent, Composio connected-account execution, OpenAI responses, Trigger.dev Cloud waitpoints/schedules, production database migration, DNS, or Vercel deployment. Once credentials exist, perform steps 3–5 above; no code fallback is needed.
