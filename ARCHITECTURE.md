# AgentCloud architecture

AgentCloud is a control plane for persistent, governed AI workers. The domain is organized so vendor SDKs are replaceable infrastructure rather than product contracts.

## Boundaries

```text
Dashboard / API / MCP
        ↓
Application services (tenant context required)
        ↓
Domain: WorkerSpec, lifecycle, policy, budget, approval
        ↓
Repositories + runtime/model/integration adapters
        ↓
PostgreSQL, Trigger.dev, AI SDK/OpenAI, Composio
```

The application layer owns orchestration. Route handlers and MCP tools only authenticate, validate input, invoke application services, and translate typed results.

## Core contracts

- `WorkerSpec` is a Zod-validated, versioned, vendor-independent document. It contains curated AgentCloud capability IDs, never vendor tool IDs or secrets.
- `WorkerVersion` is immutable. Every run retains its exact version ID and the worker's active version changes only through deploy or rollback.
- `IntegrationAdapter` is the sole route to external capabilities. Composio and deterministic demo integrations implement the same interface.
- `WorkerRuntime` owns deployment, schedules, triggering, pause/resume, and cancellation. Trigger.dev details do not enter WorkerSpec.
- `ModelProvider` isolates AI SDK/provider APIs. The compiler and runner both have deterministic fake providers for CI/demo operation.

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

There is no model-to-Composio path. Unknown and ungranted capabilities are denied. An approval binds to the hash of a canonical normalized request. A live write is unique by `(run_id, model_tool_call_id)`; a successful result is replayed, while an ambiguous dispatch is marked `OUTCOME_UNKNOWN` and is not blindly retried.

## Persistence and tenancy

PostgreSQL is the durable source of truth. Tenant-owned tables carry `organization_id`, and repository calls require tenant context as part of their input. IDs alone are never treated as authorization. Audit events are append-only.

Clerk supplies web identity, organizations, and OAuth tokens for the remote MCP endpoint. Clerk external IDs are resolved to internal organization/user rows at the application boundary. Demo mode uses an explicit local tenant and cannot activate implicitly in production.

## Runtime independence

AgentCloud stores runtime IDs in `runtime_deployments`, `worker_triggers`, and `runs`, not in WorkerSpec. The generic `run-worker` task receives only tenant/worker/version/run references and trigger data. It reloads immutable state and rechecks lifecycle, policy, budgets, and connections before executing.

Imperative schedules are synchronized by a stable worker/trigger key, so a new version updates the existing Trigger.dev schedule instead of duplicating it. The scheduled task resolves the persisted trigger, checks that it is enabled and still points at the active deployed version, creates a uniquely correlated run, and invokes the same worker task path. Signed webhook endpoints resolve their tenant from the persisted trigger—not from caller input—and create runs through that same path.

## Approval durability

When a policy decision requires approval, the run enters `WAITING_FOR_APPROVAL`, an approval row is persisted, and Trigger.dev waits on a token. Approval/rejection completes that token. The resumed execution re-hashes the normalized request before any side effect.

## Demo mode

`DEMO_MODE=true` selects deterministic model, integration, and runtime adapters through the same production interfaces. It provides the complete lifecycle without vendor credentials. Production never falls back to demo behavior when a credential is absent.

With `DEMO_MODE=false`, the control plane is PostgreSQL-backed, compilation/execution use the OpenAI adapter, integrations use Composio, and runs use Trigger.dev. Missing configuration fails closed at the relevant boundary. The demo JSON store is never imported as a production fallback.
