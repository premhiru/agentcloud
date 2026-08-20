# AgentCloud implementation progress

## Current status

Milestones 0–8 are complete. The full Definition of Done in `PLAN.md` is satisfied for the credential-independent MVP. The repository was initially empty apart from `PLAN.md`.

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
- [x] Milestone 5 — Real Integrations
- [x] Milestone 6 — MCP
- [x] Milestone 7 — Canonical Demo
- [x] Milestone 8 — Production Hardening

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

### Milestone 5 — Real Integrations (2026-08-18)

Working: production `ComposioIntegrationAdapter`; current Composio Core 0.16 direct execution and connected-account link APIs; toolkit versions pinned to the current 20260721_00 Gmail/HubSpot/Slack catalogs; explicit mappings for all nine curated capabilities; tenant-scoped opaque connected-account references; OAuth connection endpoint/UI; expired/revoked/missing connection handling; argument normalization; authentication/rate-limit/transient/unknown-outcome classification; and defense-in-depth dry-run write suppression. Demo and production adapters implement the same interface, with no fallback.

Verification:

- `pnpm lint` — passed, zero warnings.
- `pnpm typecheck` — passed against installed Composio types.
- `pnpm test` — passed, 17 files / 67 tests.
- `DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true pnpm build` — passed.

Integration evidence proves no destructive vendor mappings, tenant-isolated connection lookup, exact opaque account routing, no Composio call during dry-run writes, and ambiguous write failures classified `UNKNOWN_OUTCOME`.

Blockers: no Composio API key or OAuth accounts are available, so real Gmail/HubSpot/Slack consent and calls are not claimed. To verify, set the four documented Composio variables, connect each account from `/integrations`, and run the live acceptance flow. All credential-independent paths are complete.

Next: Milestone 6 authenticated remote MCP v2 endpoint, scopes, lifecycle tools, and protocol client tests.

### Milestone 6 — MCP (2026-08-18)

Working: authenticated Streamable HTTP MCP endpoint on `/api/mcp`; RFC 9728 protected-resource metadata; Clerk OAuth token verification in production and explicit deterministic demo tokens in demo mode; organization selection derived from AgentCloud membership rather than caller parameters; per-tool enforcement of the seven documented OAuth scopes; all required lifecycle tools, including cancellation and usage; immutable version creation; live-run approval pause/resume; and a real MCP SDK client acceptance test. A second MCP client can reconnect after the initiating client closes and retrieve the persisted worker and run.

Verification:

- `pnpm test:mcp` — passed, 1 file / 3 protocol tests.
- `pnpm lint` — passed, zero warnings.
- `pnpm typecheck` — passed against MCP server/client v2 and Clerk MCP types.
- `pnpm test` — passed, 18 files / 70 tests.
- `DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true pnpm build` — passed; authenticated MCP and OAuth metadata routes built as dynamic endpoints.

MCP evidence covers missing/invalid bearer rejection, read-only scope denial, full tool discovery, create/inspect/update/version/test/deploy/trigger/get-run/list-and-approve/pause/resume/rollback, exactly one approved email effect in the persisted timeline, and state recovery from a new disconnected client session.

Blockers: production OAuth consent cannot be exercised without Clerk application credentials. The server uses Clerk's current MCP verification and metadata integration; to verify externally, configure the documented Clerk keys, create the OAuth application/scopes, seed the user's AgentCloud organization membership, and connect an MCP client to `/api/mcp`.

Next: Milestone 7 canonical Inbound Sales Worker acceptance path through Gmail read, HubSpot upsert, email approval and execution, Slack notification, and final timeline.

### Milestone 7 — Canonical Demo (2026-08-18)

Working: the canonical Inbound Sales Worker now runs through the same governed runner, policy, budget, integration, approval-hash, checkpoint, and idempotency abstractions used by the production design. Safe tests execute real fake-adapter reads while suppressing every write. Live runs read Gmail fixtures, search and update HubSpot once, pause on the approval-required email, execute the exact approved email once, resume without rerunning earlier work, notify Slack once, and finish with a readable persisted timeline. The dashboard has a working `Run now` control, approval card, and resumed run view. Demo-file writes use atomic replacement so concurrent Next.js processes never observe partially-written JSON.

Verification:

- `pnpm lint` — passed, zero warnings.
- `pnpm typecheck` — passed.
- `pnpm test` — passed, 19 files / 71 tests.
- `DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true pnpm test:e2e` — passed, 3 critical Chromium journeys, including live trigger → approval → resumed success.
- `DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true pnpm build` — passed, all application/MCP routes built.

Acceptance evidence asserts the exact canonical sequence, zero dry-run writes, one HubSpot update, one approved Gmail send, one Slack post, final `SUCCEEDED`, duplicate approval refusal, and no duplicate email side effect. The MCP protocol test reaches the same lifecycle and proves persistence across a disconnected client.

Blockers: real vendor execution remains unverified because no Composio, Clerk, OpenAI, Trigger.dev, or deployment credentials are available. The complete credential-free acceptance path uses deterministic adapters behind the production interfaces as required.

Next: Milestone 8 production hardening — repository fail-closed behavior, rate limiting, audit and usage surfaces, deployment configuration, complete safety-invariant coverage, documentation, and final verification matrix.

### Milestone 8 — Production Hardening (2026-08-18)

Working: explicit production control-plane selection with no demo fallback; PostgreSQL-backed workers, immutable versions, runs, approvals, audit, usage, connections, runner journals, idempotent tool execution, and atomic distributed rate limits; Clerk organization/user membership synchronization; AI SDK/OpenAI compiler and worker adapters; Trigger.dev manual, imperative schedule, pause/resume/cancel, and durable waitpoint execution; version-pinned scheduled dispatch; signed, size-limited, rate-limited, deduplicated webhook ingestion; complete Composio connection callback validation; production error persistence; monthly/per-run cost enforcement; actual dashboard counts/activity/connection state; route loading/error states; version creation/deploy-latest/rollback controls; security headers; Vercel and Trigger.dev configuration; CI browser coverage; and complete deployment/operator documentation.

Verification:

- `pnpm db:generate` — passed; 17 tables, no schema drift or missing migration.
- Embedded PostgreSQL migration verification — passed; all committed migrations applied and all 17 durable tables exist.
- `pnpm lint` — passed, zero warnings.
- `pnpm typecheck` — passed.
- `pnpm test:integration` — passed, 9 files / 29 tests.
- `pnpm test:security` — passed, 1 file / 14 Product Safety Invariant tests.
- `pnpm test:mcp` — passed, 1 file / 3 authenticated protocol lifecycle tests.
- `pnpm test` — passed, 23 files / 89 tests.
- `DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true pnpm build` — passed; optimized Next.js build includes all UI, API, MCP, OAuth metadata, integration callback, version, and webhook routes.
- `DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true pnpm test:e2e` — passed, 4 Chromium journeys: create/safe test; deploy/pause/resume; live approval/resume; create version/deploy latest/rollback.
- Browser visual QA — passed at desktop and 390 px: no horizontal page overflow, no console errors, accessible controls, and responsive navigation.

Safety/reliability evidence includes default-deny authority, compiler self-grant refusal, deeply frozen WorkerSpecs during model calls, unknown capability denial, mandatory policy gating, exact-hash approval resume, zero dry-run writes, cross-tenant worker/run/approval/connection denial, secret redaction, MCP output secret exclusion, prompt-injection non-authority, one side effect per run/tool-call key, fail-safe unknown outcomes, immutable deployed specs, version-pinned live runs, HMAC webhook validation, and duplicate webhook/side-effect suppression.

Credential-dependent external verification remains intentionally unclaimed: no Clerk, OpenAI, Composio, Trigger.dev Cloud, Neon, or Vercel credentials are available. `DEPLOYMENT.md` records the exact provisioning, migration, task deployment, OAuth callback, smoke-test, and rollback steps. All independent implementation and deterministic acceptance paths are complete.

Next: operator credential provisioning and external smoke verification using `DEPLOYMENT.md`; no additional MVP code work is required.

## Post-MVP launch readiness (2026-08-19)

### CI migration boundary

Working: command-line migration and seed entry points now use a framework-neutral database client while application imports retain the `server-only` guard. This removes the GitHub Actions migration crash without weakening the Next.js server boundary.

Verification: focused ESLint and import checks pass; the local migration command reaches database configuration instead of failing on `server-only`. A PostgreSQL-backed migration and the broader workflow will be verified in GitHub Actions after this commit is pushed.

GitHub Actions verification: PostgreSQL migration and lint now pass. The first unblocked run then exposed that the root TypeScript project was also compiling the independently packaged Sites application without its npm dependencies. The root project now excludes that package, while CI installs and runs the Sites build/render tests explicitly. Local root typecheck and the Sites production test pass.

Next: restore the public GitHub conversion path, publish launch/community assets, validate Registry metadata, and complete the launch verification pass.

### Public discovery funnel

Working: the public AgentCloud product page and interactive demo now keep the deterministic demo as the primary action while exposing the public GitHub repository through the header, hero, launch callout, demo header, and footer. Repository metadata now points back to the public product page and includes focused MCP, agent, workflow, and safety topics.

Verification: the Sites production build and all three rendered-page tests pass, including direct checks for both the demo route and repository URL.

Next: publish the verified Sites version, then validate the deployed links and complete the community and registry package.

### Community and launch package

Working: contribution guidance, security-aware issue forms, a safety-boundary pull request template, reusable launch copy, positioning, and a 75-second demo script are ready for the public repository. The launch language distinguishes the credential-free deterministic demo from unverified vendor-backed production claims.

Verification: all issue-form YAML parses, all package files pass Prettier, and `git diff --check` passes.

Next: publish the community package and finish the guarded MCP Registry release path.

### MCP Registry release preparation

Working: schema-valid remote-server metadata, a continuous metadata validation workflow, and a reviewed manual GitHub OIDC publication workflow are ready. Publication is gated on an exact confirmation, a real HTTPS `/api/mcp` endpoint, protected-resource metadata, the unauthenticated OAuth challenge, a pinned checksum-verified official publisher, and post-publish version lookup.

Verification: `server.json` validates against the official 2025-12-11 schema; the publisher v1.8.1 release checksum matches the official GitHub release asset; metadata and workflows pass formatting checks.

Blockers: official Registry publication remains correctly disabled until a stable production endpoint and real Clerk OAuth interoperability are verified. The marketing Sites deployment is not a production MCP runtime.

Next: run the complete repository validation suite, verify GitHub Actions, and publish the remaining repository updates.

### Launch verification

Working: Sites version 3 is public at `https://agentcloud-control-plane.premhiru.chatgpt.site`; the primary demo and secondary GitHub paths resolve; repository homepage, description, and discovery topics are published; the local development application is restored on port 3000.

Verification:

- GitHub Actions CI run `32211625961` passed PostgreSQL migration, root lint/typecheck/tests/build, four Chromium journeys, companion-site install/lint/build/render tests, and cleanup.
- MCP Registry metadata workflow run `32211200236` passed.
- Local validation passed: 42 unit tests, 29 integration tests, 14 security invariant tests, 3 authenticated MCP lifecycle tests, optimized application build, 4 critical Chromium journeys, companion-site lint, and 3 production render tests.
- Live public-site verification passed: safe test with zero writes; live approval pause/resume; one email timeline event; worker pause/resume; version creation/rollback; and public GitHub resolution.

External gates: a production AgentCloud runtime and official Registry publication still require the operator credentials and OAuth checks in `DEPLOYMENT.md` and `docs/MCP_REGISTRY.md`.

Next: provision operator credentials for the production runtime, verify OAuth from a real MCP host, then run the guarded Registry publication workflow. No credential-independent launch work remains.

### Clerk authentication and open-source licensing

Working: the repository is linked to Clerk application `app_3I7MQibBTXcgmOJHpTxu0yR0bjr` with ignored local development credentials. The Next.js 16 proxy lives under `src/`, includes the API and Clerk matchers, and keeps demo mode credential-free. Authenticated application pages enforce access next to the resource with asynchronous `auth.protect()`. The public landing page exposes clear sign-in and account-creation controls, with dedicated polished sign-in and sign-up routes. The project is licensed under Apache License 2.0, and GitHub now has a verified social-preview image.

Verification:

- `clerk doctor` — passed; the linked application and local development keys are valid.
- `pnpm lint` — passed with zero warnings.
- `pnpm exec tsc --noEmit --incremental false` — passed.
- `pnpm exec vitest run --maxWorkers=1` — passed, 24 files / 94 tests.
- `pnpm test:mcp` — passed, 3 authenticated protocol lifecycle tests.
- `pnpm build` — passed; the optimized build includes the Clerk proxy and both auth routes.
- Browser verification — passed; the signed-out landing controls render, `/sign-in` loads GitHub, Google, email, and password options, and protected application pages use Clerk-backed access enforcement.
- GitHub Actions run `32219403418` — passed in 2m36s: PostgreSQL migration, lint, typecheck, 94 tests, production build, 4 Playwright journeys, and all companion-site checks. The workflow now downloads pinned Chromium without the redundant hosted OS-package installation that had exhausted the previous run's 20-minute limit.

External gate: the configured Clerk instance uses development keys. Public production authentication still requires creating/configuring a Clerk production instance and setting its production keys in the deployment environment; no production-auth success is claimed yet.

Next: create the first development user from the open sign-in/sign-up page, then provision the Clerk production instance alongside the remaining operator services in `DEPLOYMENT.md`.

### Authenticated tenant onboarding (2026-08-20)

Working: signed-in users without an active Clerk organization now reach a dedicated organization create/select screen instead of a server error. UI pages use a page-only tenant resolver that redirects this recoverable onboarding state, while API and MCP tenant resolution remain default-deny. After organization creation, Clerk organization, user, and membership records synchronize into PostgreSQL before the dashboard loads.

Verification:

- Focused organization-routing tests — passed, 8 tests across the tenant-page and proxy suites.
- `pnpm lint` — passed with zero warnings.
- `pnpm exec tsc --noEmit --incremental false` — passed.
- Full deterministic suite — passed, 25 files / 97 tests.
- `pnpm build` — passed; the optimized build includes `/onboarding` and every authenticated application route.
- Signed-in browser verification — `/approvals` redirects to `/onboarding`; organization creation returns to `/dashboard` with HTTP 200; PostgreSQL contains exactly one synchronized organization, user, and membership for the new account.

Local development now runs against a dedicated PostgreSQL 16 container with all 17 migrations applied. Production still requires an operator-managed PostgreSQL service and Clerk production instance; the local container and Clerk development keys are not presented as deployment verification.

### Integration configuration UX (2026-08-20)

Working: authenticated integration pages now detect missing Composio operator configuration before presenting Gmail, HubSpot, or Slack connection actions. Unconfigured providers show a clear setup-required state with environment-variable names only, never credential values, and the page links to the credential-free deterministic demo. The connection API distinguishes missing configuration from upstream connection failures instead of reducing both to a raw `INTEGRATION_CONFIGURATION_REQUIRED` response.

Verification:

- Focused Composio adapter tests — passed, including safe missing-configuration reporting.
- `pnpm lint` — passed with zero warnings.
- `pnpm exec tsc --noEmit --incremental false` — passed.
- Full deterministic suite — passed, 25 files / 98 tests, including authenticated MCP lifecycle persistence.
- `pnpm build` — passed; the optimized build includes the configuration-aware integration route and page.

External gate: real Gmail OAuth requires server-only `COMPOSIO_API_KEY` and `COMPOSIO_AUTH_CONFIG_GMAIL` values from an operator-configured Composio project. Until those credentials exist, the live app intentionally does not offer a nonfunctional Gmail connect button; the deterministic demo remains fully usable without external writes.

### Floot-inspired builder foundation — compiler and proposals (2026-08-20)

Working: AgentCloud now treats model compiler output as an untrusted proposal and applies deterministic authority normalization in application code. Every curated grant receives an explicit rule; missing rules fail closed, duplicate grants/rules are resolved conservatively, and a model-proposed direct allow for high-risk Gmail sending is tightened to approval-required. A pure proposal layer now produces canonical spec hashes, deployment-readiness checks, sorted compiler findings, and deterministic human-readable diffs against an immutable base WorkerSpec.

This is the AgentCloud adaptation of Floot's build loop: proposals are reviewable previews, not deployed state. Missing connections, unsupported capabilities, and unresolved human questions block deployment without preventing the proposal from being inspected and refined. Compiler warnings remain visible without silently expanding authority.

Verification:

- Focused compiler, proposal, and security suites — passed, 3 files / 23 tests.
- Full unit and security suites — passed, 15 files / 70 tests.
- Scoped ESLint — passed with zero warnings.
- `pnpm exec tsc --noEmit --incremental false` — passed.
- `git diff --check` — passed.

Next: persist tenant-scoped conversational builder sessions with append-only proposals, optimistic revision checks, redaction, and an atomic proposal-to-immutable-version commit boundary.
