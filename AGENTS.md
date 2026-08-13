# AgentCloud engineering rules

- Preserve strict tenant isolation: every tenant-owned repository/service operation requires an organization ID.
- Preserve immutable, versioned WorkerSpecs. Never mutate deployed specs or detach runs from their exact version.
- Never bypass the deterministic Policy Engine. Unknown operations are denied by default.
- Never expose credentials in WorkerSpecs, browser bundles, logs, audit events, APIs, or MCP output.
- Keep integrations behind `IntegrationAdapter` and runtimes behind `WorkerRuntime`.
- Preserve approval request hashing, side-effect idempotency, and dry-run write suppression.
- Add tests for every security-sensitive change, especially tenant, policy, approval, and write paths.
- Do not add dead UI controls or fake navigation.
- Run lint, typecheck, tests, and production build before declaring work complete.
