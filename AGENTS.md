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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
