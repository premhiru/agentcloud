# AgentCloud project site

The companion product page for AgentCloud. It presents the conversational builder, governed worker lifecycle, authenticated MCP, and canonical Inbound Sales Worker demo without depending on the AgentCloud application runtime.

The device-local demo covers describe, refine, readiness and authority review, immutable save, zero-write testing, explicit deployment, approval pause/resume, improvement, pause/resume, and rollback. It uses deterministic fixtures and never connects to vendor accounts or performs external writes.

## Local development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run lint
npx tsc --noEmit
npm test
```

`npm test` performs a production vinext build and validates the server-rendered page. The site deploys through OpenAI Sites using the project binding in `.openai/hosting.json`.
