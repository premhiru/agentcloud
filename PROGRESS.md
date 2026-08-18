# AgentCloud implementation progress

## Current status

Milestones 0–4 are complete. Milestone 5 is in progress. The repository was initially empty apart from `PLAN.md`.

## SDK verification (2026-08-13)

Verified official documentation and current published package metadata before implementation:

- Next.js 16.3 (`proxy.ts` convention), React 19.2, Tailwind CSS 4.
- Clerk Next.js 7.7 and current Clerk MCP OAuth guidance.
- MCP TypeScript SDK v2 modular server/client packages and protocol revision 2026-07-28.
- AI SDK 7.0 (`ToolLoopAgent`, structured `Output.object`).
- Trigger.dev 4.5 (tasks, schedules, waitpoint tokens, explicit idempotency scopes).
- Composio Core 0.16 connected accounts/tools APIs.
- Drizzle ORM 0.45 code-first generated migrations.

## Milestones

- [x] Milestone 0 — Foundation
- [x] Milestone 1 — AgentCloud Core
- [x] Milestone 2 — Worker Dashboard
- [x] Milestone 3 — Runtime
- [x] Milestone 4 — Human Approval
- [ ] Milestone 5 — Real Integrations
- [ ] Milestone 6 — MCP
- [ ] Milestone 7 — Canonical Demo
- [ ] Milestone 8 — Production Hardening

## Verification log

Commands and exact outcomes are recorded at each milestone boundary.

### Milestone 0 — Foundation (2026-08-13)

Working: Next.js 16 App Router foundation, strict TypeScript, Tailwind 4 visual system, Clerk organization-aware auth boundary with explicit demo mode, complete Drizzle schema and generated migration for 16 tables, baseline dashboard shell, CI, environment contract, and architecture/security/developer documentation.

Verification:

- `pnpm db:generate` — passed; generated `drizzle/0000_damp_magik.sql` for 16 tables.
- `pnpm lint` — passed, zero warnings.
- `pnpm typecheck` — passed.
- `pnpm test` — passed, 1 file / 2 tests.
- `DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true pnpm build` — passed; landing and dashboard routes prerendered.

Blockers: none. Production Clerk, Neon, Trigger.dev, Composio, OpenAI, and Vercel credentials are not present; demo/CI paths remain fully implementable and production adapters will fail closed when unconfigured.

Next: Milestone 1 domain core — WorkerSpec, registry, compiler, policy, budget, hashing, fake model and integrations.

### Milestone 1 — AgentCloud Core (2026-08-18)

Working: strict versioned WorkerSpec 1.0; deeply immutable version objects and deploy/pause/resume/rollback transitions; curated nine-capability Gmail/HubSpot/Slack registry; compiler constrained to registered capabilities; canonical spec/action hashing; deterministic default-deny policy engine with approval and domain/daily constraints; budget checks and cost estimates; deterministic compiler model; and a fake integration adapter with realistic fixtures and hard dry-run write suppression.

Verification:

- `pnpm lint` — passed, zero warnings.
- `pnpm typecheck` — passed.
- `pnpm test` — passed, 9 files / 39 tests.
- `DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true pnpm build` — passed.

Security evidence includes unknown-tool denial, ungranted-tool denial, invalid input denial, default-deny behavior, no secret-shaped WorkerSpec extras, unsupported compiler capability reporting, canonical approval hash sensitivity, immutable nested version data, and zero fake-adapter writes in dry-run mode.

Blockers: none. Real model and Composio calls remain intentionally deferred behind the verified interfaces until their integration milestones.

Next: Milestone 2 worker dashboard and its wired create/detail/version/run/integration/approval journeys.

### Milestone 2 — Worker Dashboard (2026-08-18)

Working: polished responsive navigation; worker list and outcome-first creation; compiled worker detail with overview, readable authority, budgets, connection summary, runs, immutable version hashes, and status; side-effect-free test control and readable run timeline; deploy/pause/resume controls; approvals empty state; connected demo integration cards; settings and audit surfaces. Every visible primary control performs a real action. Demo state is shared durably across Next.js server processes rather than being tied to the initiating request.

Verification:

- `pnpm lint` — passed, zero warnings.
- `pnpm typecheck` — passed.
- `pnpm test` — passed, 10 files / 42 tests.
- `DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true pnpm test:e2e` — passed, 2 critical Chromium journeys (create → inspect → safe test; deploy → pause → resume).
- `DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true pnpm build` — passed, 13 routes built.

The initial browser run exposed process-local demo state; it was corrected to shared durable demo storage and the flows then passed. Cross-tenant dashboard store access remains covered.

Blockers: none. The dashboard currently uses the deterministic demo control-plane implementation; Milestone 3 replaces lifecycle/run orchestration with the runtime/repository contracts while retaining this credential-free path.

Next: Milestone 3 runtime adapter, durable runner, triggers, timelines, cancellation, and write idempotency.

### Milestone 3 — Runtime (2026-08-18)

Working: vendor-neutral `WorkerRuntime`; deterministic fake runtime; Trigger.dev v4 runtime using current task, run-cancellation, imperative schedule create/update/activate/deactivate APIs; stable schedule keys; reference-only durable task payloads; generic budget/connection/policy-wrapped worker runner; manual/schedule/webhook payload support; persisted readable demo timelines; cancellation; duplicate-webhook handling; side-effect uniqueness by run/tool-call ID; successful result replay; changed-request rejection; and fail-safe `OUTCOME_UNKNOWN` handling.

Verification:

- `pnpm lint` — passed, zero warnings.
- `pnpm typecheck` — passed against installed Trigger.dev types.
- `pnpm test` — passed, 14 files / 56 tests.
- `DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true pnpm build` — passed.

Runtime/security evidence includes schedule update without duplication, paused-worker trigger rejection, cancellation, tenant-isolated webhook keys, changed webhook payload rejection, duplicate live-write replay with exactly one adapter call, no adapter call for dry-run writes, unknown-outcome non-retry, complete dry-run reasoning path, and live execution stopping at the approval boundary.

Blockers: Trigger.dev Cloud deployment is not verifiable without project credentials; the task and runtime code compile, and deterministic runtime coverage is complete.

Next: Milestone 4 durable approval records, expiry/rejection, request re-hashing, exact-run resume, waitpoint integration, dashboard decisions, and notification abstraction.

### Milestone 4 — Human Approval (2026-08-18)

Working: approval repository/waitpoint/notifier abstractions; Trigger.dev waitpoint token adapter; deterministic waitpoints and notifications; canonical request hash binding; recursive secret redaction; expiry, rejection, cancellation-ready statuses, tenant-scoped decisions, comments, and exact payload re-hashing before execution; idempotent approved execution; persisted demo approval decisions; real approval/reject dashboard controls; and a serializable runner checkpoint that resumes the same live run after the approved action without re-running prior CRM side effects or re-invoking the model.

Verification:

- `pnpm lint` — passed, zero warnings.
- `pnpm typecheck` — passed against installed Trigger.dev waitpoint types.
- `pnpm test` — passed, 16 files / 62 tests.
- `DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true pnpm build` — passed.

Approval evidence proves redacted previews, exact-hash binding, cross-tenant denial, expiry, structured rejection, hash-mismatch refusal, duplicate approved execution replay, pause at email, resume from the stored checkpoint, one HubSpot update, one email, one Slack post, and final success.

Blockers: live Trigger.dev Cloud waitpoint behavior cannot be externally verified without credentials; current SDK calls compile and the lifecycle is proven through the same abstractions using deterministic adapters.

Next: Milestone 5 Composio adapter, curated Gmail/HubSpot/Slack mappings, connection lifecycle, and fail-closed production configuration.
