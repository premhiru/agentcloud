## Outcome

<!-- What user-visible or operational outcome does this change deliver? -->

## Scope

<!-- Summarize the implementation. Link the issue with "Closes #..." when applicable. -->

## Safety boundaries

<!-- Explain each affected boundary. Write "Not affected" where appropriate. -->

- Tenant isolation:
- WorkerSpec immutability and run version pinning:
- Default-deny policy:
- Approval hashing and resume:
- Dry-run write suppression:
- Side-effect idempotency:
- Credential and log redaction:
- Runtime and integration abstractions:

## Verification

<!-- List exact commands and results. -->

- [ ] Smallest relevant tests pass
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes
- [ ] Critical Playwright flows pass when user-visible behavior changed
- [ ] PostgreSQL-backed migration and integration tests pass when persistence changed

## Product quality

- [ ] New or changed primary controls have working behavior
- [ ] Failure paths fail closed and expose no secrets
- [ ] Documentation and configuration examples are current
- [ ] UI changes include screenshots or a short recording
- [ ] No unrelated generated files or formatting changes are included

## Deployment and rollback

<!-- Note migrations, environment changes, rollout order, monitoring, and rollback. Write "None" if not applicable. -->
