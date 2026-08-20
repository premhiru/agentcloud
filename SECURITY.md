# AgentCloud security model

## Non-negotiable invariants

1. Tenant context is enforced by every application service and repository operation.
2. WorkerSpecs and deployed versions cannot be mutated in place.
3. A run is permanently pinned to the exact WorkerSpec version it loaded.
4. Authority is default-deny; unknown or ungranted capabilities are denied.
5. Every tool execution passes through the deterministic Policy Engine.
6. Approval-required requests bind approval to a canonical request hash.
7. Dry-run mode never invokes external writes.
8. External writes are idempotent; ambiguous outcomes are not blindly retried.
9. Workers cannot modify specs, authority, capabilities, or budgets.
10. Credentials never enter WorkerSpec, browser data, MCP output, audit metadata, or logs.
11. Builder proposals cannot execute tools, mutate deployed versions, or deploy themselves.
12. A builder commit must match the current session revision and exact reviewed WorkerSpec hash.

Automated unit, integration, security, MCP, and browser tests prove these invariants.

## Tenant isolation

Tenant-owned tables include `organization_id`. Repository APIs accept structured identifiers that always include it. Authorization is enforced server-side after Clerk or MCP OAuth authentication; client-supplied organization IDs are never trusted as identity. Builder sessions, messages, and proposals use the same tenant boundary, and cross-tenant session IDs resolve as not found. Cross-tenant tests cover builders, workers, approvals, runs, connections, memory, and logs.

## Conversational builder

Builder input is untrusted. Objectives and constraints are bounded, common credential-shaped values are redacted before storage, and model output must pass the WorkerSpec schema, curated capability registry, safe authority normalization, readiness assessment, and canonical hashing. Unsupported capabilities and unresolved questions remain blockers rather than being replaced with invented tools.

Builder revisions are append-only proposals, not executable worker versions. Refinement uses optimistic concurrency. Commit transactionally revalidates the proposal, revision, hash, tenant, user membership, worker/base-version references, and registered capabilities before appending an immutable WorkerVersion. A commit can create a DRAFT version when readiness is blocked, but it cannot deploy, trigger, connect an integration, or change an active deployed version.

## External content

Email, CRM data, Slack content, and webhook bodies are untrusted data. Runner system instructions state this boundary, but the hard guarantee is structural: content cannot add registered tools, capability grants, authority rules, or budgets. Webhooks use a worker-specific URL plus mandatory HMAC-SHA256 verification with the server-held signing secret. They have a 256 KiB limit, reject dangerous prototype-shaped keys, rate-limit per persisted trigger, redact common secret-shaped fields before run/audit persistence, and transactionally deduplicate idempotency keys. The organization is derived from the enabled trigger row.

## Secrets and logs

Third-party OAuth credentials remain in Composio. Server-only environment variables hold application credentials. A central recursive redactor masks authorization headers, tokens, API keys, secrets, passwords, and cookies before structured logs or audit storage. MCP builder responses omit tenant IDs, internal user IDs, and storage-only message encoding. Builder route and MCP errors use allowlisted typed codes; unknown compiler, database, and vendor errors become generic failures without prompts, payloads, or stack traces.

## Side effects

The integration adapter classifies each capability as read, write, or external communication. Reads may retry only for controlled transient/rate-limit failures. A write execution is claimed transactionally at the uniqueness boundary `(run_id, model_tool_call_id)`. If the adapter reports or may have encountered a post-dispatch network failure, the record becomes `OUTCOME_UNKNOWN` and requires operator review.

## Approvals

Approval previews are redacted. Approval records expire. Decisions require tenant membership, and approval execution verifies status, expiry, run/version identity, capability, and request hash. Rejections return structured tool results so a worker can conclude safely.

## Abuse controls and browser policy

Mutating web routes and MCP tools use organization/user/operation rate-limit buckets; production buckets are atomic PostgreSQL upserts, while deterministic tests use an in-process bucket. MCP builder limits are 20 starts, 30 refinements, 20 commits, and 20 abandons per minute; reads use the standard 120-operation-per-minute limit. Signed webhooks have a separate per-trigger bucket. Responses include a bounded retry interval and never expose stack traces. The application emits clickjacking, MIME-sniffing, referrer, browser-capability, and opener-isolation headers.

## Reporting vulnerabilities

Do not open public issues for suspected credential exposure or authorization bypass. Contact the repository owner privately with reproduction details and affected scope.
