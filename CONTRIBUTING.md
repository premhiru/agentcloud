# Contributing to AgentCloud

Thanks for helping build AgentCloud. This project is a control plane for durable AI workers, so correctness at the authorization, tenant, approval, and side-effect boundaries matters more than adding surface area quickly.

## Before you start

- Search the existing issues before opening a new one.
- Use a GitHub Discussion or a focused issue for design questions that may change public contracts.
- Keep changes small enough to review and verify independently.
- Never include credentials, customer data, access tokens, or unredacted external payloads in issues, fixtures, screenshots, commits, or logs.
- Report suspected vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).

## Development setup

AgentCloud requires Node.js 24 or later and pnpm 11.

```bash
git clone https://github.com/premhiru/agentcloud.git
cd agentcloud
pnpm install
cp .env.example .env.local
pnpm dev
```

On PowerShell, copy the environment file with:

```powershell
Copy-Item .env.example .env.local
```

The checked-in defaults run the deterministic demo adapters. They do not perform external writes and do not require vendor credentials.

## Architecture guardrails

Every contribution must preserve these boundaries:

1. **Tenant isolation:** every tenant-owned repository and service operation requires an organization ID. Never trust a client-supplied organization ID as identity.
2. **Immutable WorkerSpecs:** deployed specs are versioned and never mutated in place. Every run remains pinned to the exact version it loaded.
3. **Default-deny authority:** every tool call passes through the deterministic Policy Engine. Unknown operations are denied.
4. **Integration abstraction:** external systems remain behind `IntegrationAdapter`; credentials never enter WorkerSpecs or client-visible data.
5. **Runtime abstraction:** durable execution remains behind `WorkerRuntime`.
6. **Approval integrity:** approval decisions remain bound to the canonical request hash and the original run checkpoint.
7. **Side-effect safety:** writes use stable idempotency keys, and ambiguous outcomes stop for reconciliation instead of retrying blindly.
8. **Dry-run safety:** dry-runs may read deterministic fixtures but must never invoke external writes.

Read [ARCHITECTURE.md](./ARCHITECTURE.md) and [SECURITY.md](./SECURITY.md) before changing any of these paths.

## Making a change

1. Create a focused branch from `main`.
2. Add or update tests before changing a security-sensitive path.
3. Run the smallest relevant test while iterating.
4. Run the complete validation contract before opening a pull request.
5. Update documentation when behavior, configuration, APIs, WorkerSpec shape, or operational procedures change.

Useful commands:

```bash
pnpm test:unit
pnpm test:integration
pnpm test:security
pnpm test:mcp
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
```

For persistence changes, run PostgreSQL-backed tests and commit the generated migration. For Next.js changes, read the relevant local guide in `node_modules/next/dist/docs/` before editing; this project uses Next.js 16 and may differ from older conventions.

## Test expectations

Tests should assert observable behavior and the boundary that protects it. Security-sensitive changes need both an allowed case and a denied or adversarial case.

At minimum, cover the applicable invariants:

- same-tenant success and cross-tenant denial;
- exact WorkerSpec version retention;
- unknown capability denial;
- write suppression during dry-run;
- approval pause, hash verification, and resume;
- duplicate side-effect prevention;
- authenticated MCP scope enforcement;
- redaction of credential-shaped values.

Use fake model, integration, and runtime adapters for deterministic tests. Real vendor credentials and network writes must not be required by CI.

## Pull requests

A pull request should explain the user-visible outcome, the boundaries affected, the tests run, and any operational or migration steps. Include screenshots for visible UI changes and a short threat analysis for authorization, tenant, approval, credential, webhook, or write-path changes.

Reviewers will check that:

- no existing safety invariant is weakened;
- primary UI controls have real behavior;
- new failure modes fail closed;
- logs and errors remain redacted;
- documentation and tests match the implementation;
- generated artifacts and unrelated formatting changes are excluded.

By contributing, you agree that your contribution may be distributed under the Apache License 2.0.
