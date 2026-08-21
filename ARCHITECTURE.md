# AgentCloud architecture

AgentCloud is a control plane for persistent, governed AI workers. The domain is organized so vendor SDKs are replaceable infrastructure rather than product contracts.

## Boundaries

```text
Dashboard / API / MCP
        ↓
Application services (tenant context required)
        ↓
Domain: builder proposal, WorkerSpec, lifecycle, policy, budget, approval
        ↓
Repositories + runtime/model/integration adapters
        ↓
PostgreSQL, Trigger.dev, AI SDK/OpenAI, official provider MCP servers, managed OAuth fallback
```

The application layer owns orchestration. Route handlers and MCP tools only authenticate, validate input, invoke application services, and translate typed results.

## Core contracts

- `WorkerSpec` is a Zod-validated, versioned, vendor-independent document. It contains curated AgentCloud capability IDs, never vendor tool IDs or secrets.
- `WorkerBuilderSession` is a tenant-owned, optimistic-concurrency workspace for conversational proposals. Its revisions are not WorkerVersions and cannot execute or deploy.
- `WorkerProposal` contains a validated WorkerSpec, canonical hash, readiness checks, connection requirements, unsupported capabilities, warnings, questions, and a human-readable diff from its base spec.
- `WorkerVersion` is immutable. Every run retains its exact version ID and the worker's active version changes only through deploy or rollback.
- `IntegrationAdapter` is the sole route to external capabilities. Official remote MCP, managed fallback, and deterministic demo integrations implement the same interface. Routing is per curated capability, never per provider alone.
- `WorkerRuntime` owns deployment, schedules, triggering, pause/resume, and cancellation. Trigger.dev details do not enter WorkerSpec.
- `ModelProvider` isolates AI SDK/provider APIs. The compiler and runner both have deterministic fake providers for CI/demo operation.

## Builder-to-runtime boundary

```text
objective / refinement
  → redacted, bounded builder message
  → structured compiler output
  → curated capability filtering + safe authority normalization
  → validated proposal + readiness + canonical spec hash
  → explicit commit of the reviewed revision and hash
  → immutable DRAFT or READY WorkerVersion
  → explicit safe test and explicit deployment
```

The builder is a planner, never an executor. A refinement cannot mutate an existing WorkerVersion, the active deployment, runtime records, integration credentials, policy state, or budgets outside the validated WorkerSpec schema. Commit uses the session’s exact revision and spec hash, so a stale browser or MCP client cannot silently save a different proposal. Committing a proposal does not deploy it.

## Execution safety path

```text
model tool request
  → curated registry lookup
  → capability grant check
  → deterministic Policy Engine
  → dry-run write suppression OR approval flow OR execution
  → idempotent tool execution record
  → integration adapter
```

There is no model-to-provider-MCP or model-to-managed-adapter path. The model can request only stable AgentCloud capability IDs. The adapter validates the registered schema, translates through a fixed allowlist, and ignores unregistered tools discovered from a remote server. Unknown and ungranted capabilities are denied. An approval binds to the hash of a canonical normalized request. A live write is unique by `(run_id, model_tool_call_id)`; a successful result is replayed, while an ambiguous dispatch is marked `OUTCOME_UNKNOWN` and is not blindly retried.

## Persistence and tenancy

PostgreSQL is the production source of truth. Tenant-owned tables—including builder sessions, messages, proposals, workers, versions, runs, approvals, and connections—carry `organization_id`, and repository calls require tenant context as part of their input. IDs alone are never treated as authorization. Builder proposal rows are append-only, commits are transactional, and audit events are append-only.

Clerk supplies web identity, organizations, and OAuth tokens for the remote MCP endpoint. Clerk external IDs are resolved to internal organization/user rows at the application boundary. MCP tool parameters never choose an organization. Demo mode uses an explicit local tenant and cannot activate implicitly in production.

## Runtime independence

AgentCloud stores runtime IDs in `runtime_deployments`, `worker_triggers`, and `runs`, not in WorkerSpec. The generic `run-worker` task receives only tenant/worker/version/run references and trigger data. It reloads immutable state and rechecks lifecycle, policy, budgets, and connections before executing.

Imperative schedules are synchronized by a stable worker/trigger key, so a new version updates the existing Trigger.dev schedule instead of duplicating it. The scheduled task resolves the persisted trigger, checks that it is enabled and still points at the active deployed version, creates a uniquely correlated run, and invokes the same worker task path. Signed webhook endpoints resolve their tenant from the persisted trigger—not from caller input—and create runs through that same path.

## Approval durability

When a policy decision requires approval, the run enters `WAITING_FOR_APPROVAL`, an approval row is persisted, and Trigger.dev waits on a token. Approval/rejection completes that token. The resumed execution re-hashes the normalized request before any side effect.

## Demo mode

`DEMO_MODE=true` selects deterministic model, integration, and runtime adapters through the same production interfaces. It provides the complete governed worker lifecycle without vendor credentials. Committed workers, versions, runs, approvals, checkpoints, and audit events use durable local JSON. Open builder sessions use an in-process repository: they can continue across MCP client disconnects while the process remains alive, but they do not survive a process restart. Production never falls back to demo behavior when a credential is absent.

With `DEMO_MODE=false`, builder sessions/proposals and the control plane are PostgreSQL-backed, compilation/execution use the OpenAI adapter, integrations route exact capabilities to an official remote MCP connection or managed fallback, and runs use Trigger.dev. Missing configuration or partial tool coverage fails closed at the relevant boundary. The demo JSON and in-process stores are never imported as production fallbacks.
