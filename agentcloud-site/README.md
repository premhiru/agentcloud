# AgentCloud project site

The companion product page for AgentCloud. It presents the durable worker lifecycle, governance model, and canonical Inbound Sales Worker demo without depending on the AgentCloud application runtime.

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
