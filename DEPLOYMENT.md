# AgentCloud production deployment

This is an operator runbook. It does not imply that any external environment has been deployed from this repository.

## 1. Provision and configure

Use Node.js 24 and pnpm 11. Create a PostgreSQL 16 or Neon database, a Clerk application with Organizations and OAuth Provider enabled, a Trigger.dev v4 project, an OpenAI API project, OAuth clients for the official Gmail/HubSpot/Slack remote MCP servers, and managed OAuth configurations for capabilities those servers do not expose.

Set every variable in `.env.example` in both the Vercel production environment and, where required by task execution, the Trigger.dev production environment. Production must explicitly use:

```text
DEMO_MODE=false
NEXT_PUBLIC_DEMO_MODE=false
APP_BASE_URL=https://your-agentcloud-domain.example
WEBHOOK_SIGNING_SECRET=<at-least-32-random-bytes>
```

Keep database, Clerk, OpenAI, Trigger.dev, provider OAuth, managed fallback, encryption, and signing secrets server-only. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `NEXT_PUBLIC_DEMO_MODE` are the only public configuration values.

Configuration responsibilities:

| Variable group | Required behavior |
| --- | --- |
| `DATABASE_URL` | PostgreSQL source of truth for organizations, builder sessions/proposals, immutable versions, runs, approvals, idempotency, usage, and audit. |
| Clerk public/secret keys | Web sign-in, organizations, and verified MCP OAuth tokens. Users must have a synchronized AgentCloud organization membership. |
| `OPENAI_API_KEY`, `WORKER_MODEL` | Structured worker compilation and production run planning. The configured model must support the installed AI SDK structured-output path. |
| Trigger.dev variables | Durable task execution, schedules, cancellation, and approval waitpoints. |
| `MCP_CONNECTION_ENCRYPTION_KEY` | Base64-encoded 32-byte key for AES-256-GCM encryption of delegated remote-MCP OAuth state. Back up and rotate through a reviewed re-authorization plan. |
| `MCP_*_CLIENT_ID`, `MCP_*_CLIENT_SECRET` | Pre-registered confidential OAuth clients for the fixed official MCP endpoints. Gmail currently covers search/read, HubSpot covers CRM operations, and Slack covers message posting. |
| Composio API/auth-config variables | Managed OAuth fallback for curated capability gaps, currently Gmail send and Slack channel listing. Tokens remain in Composio. |
| `APP_BASE_URL` | Canonical HTTPS application origin used for integration callbacks and MCP dashboard continuation URLs. |
| `WEBHOOK_SIGNING_SECRET` | At least 32 random bytes for raw-body HMAC-SHA256 verification. |

In Clerk, grant MCP clients only the scopes they need from: `workers:read`, `workers:write`, `workers:deploy`, `runs:read`, `approvals:read`, `approvals:write`, and `connections:read`. Enable dynamic client registration if the intended MCP host requires it. Each user must select an organization and visit AgentCloud once before their first MCP connection so the membership is synchronized.

Register this exact callback URL with every provider OAuth client and managed auth configuration:

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
4. Sign in, select/create an organization, and start a worker builder. Refine it, verify readiness/diff/hash, commit the reviewed proposal, and confirm PostgreSQL contains the builder session, proposal, worker, and immutable version for that organization.
5. Connect Gmail/HubSpot/Slack from a worker readiness link. Verify the UI reports exact capability coverage, run a safe test, and confirm no external write occurred.
6. Deploy and manually trigger the worker. Confirm it enters `WAITING_FOR_APPROVAL`, approve the exact request, and confirm the same run reaches `SUCCEEDED` with one external email step.
7. Start a refinement from the deployed worker, commit a new version, and confirm the deployed active version did not change until explicit deployment. Verify rollback reactivates the selected historical version.
8. Connect an OAuth MCP client to `/api/mcp` and repeat the builder, dry-run, deployment, approval, observation, refinement, and rollback lifecycle with least-privilege scopes.

## 4. Operational checks

- Check `/dashboard`, `/runs/{id}`, `/approvals`, `/connections`, and `/activity` for persisted state and audit events.
- Disconnect the initiating browser/MCP client, reconnect with another authenticated client, and recover the builder session, committed worker, and run from PostgreSQL.
- Confirm MCP continuation URLs use the configured `APP_BASE_URL`, contain no credentials, and stay on the AgentCloud origin.
- Verify schedule pause/resume in Trigger.dev after pausing/resuming a worker.
- Treat `OUTCOME_UNKNOWN` writes as manual reconciliation events; do not automatically retry them.
- Rotate `WEBHOOK_SIGNING_SECRET` in a coordinated maintenance window because existing senders must update simultaneously.
- Do not enable demo flags in preview or production environments that contain real users.

## 5. Rollback

Application rollback is a Vercel revision rollback paired with the matching Trigger.dev task revision. Database migrations are forward-only: restore from the pre-release backup or apply a reviewed corrective migration rather than editing committed migration history. Worker rollback is separate and available from the worker page or `rollback_worker`; it activates an immutable historical WorkerSpec without changing prior runs.

## Credential-dependent verification still required

Without operator credentials, this repository cannot claim real provider MCP OAuth/tool compatibility, managed connected-account execution, Clerk OAuth consent, OpenAI responses, Trigger.dev Cloud waitpoints/schedules, production database migration, DNS, or Vercel deployment. The credential-free demo validates the same application contracts with deterministic adapters, but its open builder sessions are in-process and its vendor actions are fixtures. Once credentials exist, perform the release and operational checks above.
