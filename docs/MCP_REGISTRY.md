# MCP Registry release runbook

AgentCloud's `server.json` describes the authenticated Streamable HTTP MCP endpoint for self-hosted production deployments. It is schema-valid metadata, not evidence that a production endpoint is live or that the entry has been published.

The official MCP Registry is currently in preview and stores discovery metadata rather than application code or runtime infrastructure. The server definition follows the current [remote server guidance](https://modelcontextprotocol.io/registry/remote-servers) and [2025-12-11 server schema](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json).

## Before publishing

1. Deploy the application from a verified release with `DEMO_MODE=false` and `NEXT_PUBLIC_DEMO_MODE=false` by following `DEPLOYMENT.md`.
2. Replace the templated `https://{agentcloud_host}/api/mcp` remote with the canonical public production URL. Do not publish a demo, preview, local, or credential-less endpoint.
3. Confirm the remote is publicly reachable and uses Streamable HTTP over HTTPS.
4. Complete the OAuth checks below from a real MCP host using a non-admin user in a dedicated test organization.
5. Update `server.json.version` to the exact application release version and run the validation workflow.
6. Review the Registry terms and preview status, then publish under the `io.github.premhiru/*` namespace with either the official CLI or the guarded manual workflow.

## OAuth interoperability gate

The current MCP authorization specification requires OAuth 2.0 Protected Resource Metadata and audience-bound access tokens. Verify all of the following against the deployed origin:

- `GET /.well-known/oauth-protected-resource` returns metadata whose `resource` is the exact `/api/mcp` URL and whose `authorization_servers` contains the configured Clerk issuer.
- An unauthenticated MCP request returns `401 Unauthorized`; its `WWW-Authenticate` challenge identifies the protected-resource metadata URL and advertises an appropriate least-privilege scope.
- The Clerk authorization server exposes OAuth authorization-server metadata or OpenID Connect discovery metadata, and the selected MCP host can register or otherwise identify itself.
- Authorization Code with PKCE (`S256`) succeeds. The client sends the canonical MCP resource URI in authorization and token requests.
- The server rejects expired tokens, tokens for another audience/resource, users without organization membership, and tokens missing the tool's required scope.
- A least-privilege client can list data but cannot create, deploy, approve, or mutate without the corresponding scope.
- The full create, dry-run, deploy, trigger, approval pause/resume, observe, pause/resume, version, and rollback lifecycle persists across a second authenticated MCP client.

See the official [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) for the discovery, resource indicator, PKCE, audience-validation, and scope requirements.

## Publish

Install the current official publisher release using the platform-specific command in the [MCP Registry quickstart](https://modelcontextprotocol.io/registry/quickstart). From the repository root:

```bash
mcp-publisher login github
mcp-publisher publish
```

GitHub authentication owns the `io.github.premhiru/*` namespace. After publishing, verify the exact version through the Registry API:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.premhiru/agentcloud"
```

Never store a Registry token, Clerk token, OAuth client secret, or publisher private key in this repository. GitHub Actions publication can use GitHub OIDC instead of a long-lived Registry credential when publication automation is added after the first verified release.

For a reviewed production release, the **Publish MCP registry release** workflow performs the same publication with GitHub OIDC and no long-lived Registry secret. It requires the canonical `/api/mcp` URL and an exact confirmation phrase, checks protected-resource metadata and the unauthenticated `401` challenge, pins and verifies the publisher binary, and confirms the published version through the Registry API. Configure required reviewers on the `mcp-registry-production` GitHub environment before using it.

## Current external blockers

Registry publication must remain pending until an operator supplies and verifies:

- a stable public production origin that serves both `/api/mcp` and the protected-resource metadata endpoint;
- production PostgreSQL, Clerk Organizations/OAuth, Trigger.dev, OpenAI, Composio, and deployment credentials described in `DEPLOYMENT.md`;
- a real OAuth consent flow and audience/scope validation from at least one supported MCP host;
- GitHub device authorization (or GitHub OIDC in a reviewed release workflow) for the `premhiru` namespace.

These are release-environment checks, not reasons to weaken authentication, tenant isolation, policy enforcement, approval hashing, idempotency, or dry-run write suppression.
