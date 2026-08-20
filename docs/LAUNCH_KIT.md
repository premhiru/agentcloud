# AgentCloud launch kit

This kit presents AgentCloud as a control plane for governed, persistent AI workers. It deliberately distinguishes the credential-free demo from production integrations that require operator-owned accounts.

## Positioning

**Category:** governed agent infrastructure

**One-line description:** AgentCloud turns a conversation into a governed, immutable worker that can run independently, pause for human approval, resume safely, and improve through observable versions.

**Short pitch:** Most agent demos disappear with the chat that created them. AgentCloud lets an operator describe and refine a worker, simulate it without writes, govern its exact authority, commit an immutable version, and operate it from a complete run timeline. The dashboard and authenticated MCP share the same system of record.

**Why it is different:**

- It governs the action, not just the prompt.
- It persists workers and runs independently of the initiating conversation.
- It separates conversational proposals from executable WorkerSpec versions: refinement never mutates a deployed worker, and saving never deploys implicitly.
- It proves sensitive behavior with deterministic tests and adapters.
- It gives operators an exact, resumable approval checkpoint instead of an informal confirmation message.
- It treats an MCP server as an authenticated control surface, not as an unrestricted bag of tools.

## Message hierarchy

1. **Describe:** turn an outcome and explicit constraints into a reviewable proposal.
2. **Simulate:** exercise the reasoning path while suppressing every external write.
3. **Govern:** inspect curated capabilities, default-deny authority, approvals, budgets, readiness, and missing connections.
4. **Deploy immutably:** commit the exact reviewed hash, then deploy through an explicit separate action.
5. **Observe and approve:** follow the timeline and resume exact approval checkpoints.
6. **Refine or roll back:** create a new proposal/version without mutating history, or restore a known version.

## Proof points

Use these concrete claims in product copy and demonstrations:

- Every run is pinned to an immutable WorkerSpec version.
- Every builder commit binds the current revision to the exact reviewed WorkerSpec hash.
- Unknown or ungranted capabilities are denied by default.
- Dry-runs return structured “would execute” events without calling write adapters.
- Approval records bind the capability and input to a canonical request hash.
- Resuming after approval continues from a stored checkpoint instead of replaying completed work.
- Stable idempotency keys prevent duplicate external effects across retries and resumes.
- Every tenant-owned operation requires an organization ID.
- The authenticated MCP exposes builder start/get/refine/commit/abandon plus the same operational lifecycle as the dashboard.

Do not claim live Gmail, HubSpot, Slack, Clerk OAuth, Trigger.dev Cloud, OpenAI, Vercel, or registry verification until it has been completed with operator-owned credentials. The public guided demo illustrates the lifecycle with device-local browser state; it is not evidence of live control-plane execution, third-party consent, or writes. The repository demo mode uses durable local JSON for committed lifecycle state, while an uncommitted builder conversation lasts only for the running application process.

## Ready-to-publish copy

### GitHub description

Conversationally designed AI workers with immutable versions, default-deny authority, safe simulation, human approvals, and an authenticated MCP.

### Social post

Agent demos are easy. Operating them safely after the conversation ends is the hard part.

AgentCloud is an open-source control plane for persistent AI workers. Describe and refine a job, simulate it without writes, inspect its authority, deploy an immutable version, approve sensitive actions, and improve it from observable history—through the dashboard or authenticated MCP.

Try the deterministic demo: https://agentcloud-control-plane.premhiru.chatgpt.site/demo

Explore the code: https://github.com/premhiru/agentcloud

### Community post

I built AgentCloud to explore a question: what does an AI worker need after the chat that created it is gone?

The answer was less “more autonomy” and more operational discipline. A worker should be easy to describe and refine, but it should become executable only through a validated immutable specification, explicit authority, a safe test mode, durable checkpoints, human approval, idempotent writes, tenant isolation, and a timeline that explains what happened. AgentCloud implements that lifecycle in a dashboard and exposes it through an authenticated MCP.

The public demo is deterministic and credential-free. It runs an inbound-sales worker, pauses before a sensitive email, and resumes the same run after approval without duplicating prior effects.

Demo: https://agentcloud-control-plane.premhiru.chatgpt.site/demo

Repository: https://github.com/premhiru/agentcloud

I would especially value feedback on the WorkerSpec, authority model, and approval-resume contract.

### Launch title options

- AgentCloud: governed workers that outlive the conversation
- Open-source control plane for persistent AI workers
- From agent demo to governed, resumable worker

## 90-second demo script

Use a clean browser profile at a desktop viewport. Keep the cursor still between actions, crop out personal browser UI, and do not show environment values or account identifiers.

| Time   | Screen and action                                                                 | Narration                                                                                                                                     |
| ------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–8s   | Product page hero. Point to **Try the interactive demo**.                         | “Most agents stop when the chat closes. AgentCloud turns a conversation into a persistent worker with explicit authority.”                    |
| 8–22s  | Choose **Create worker**, describe the sales outcome, and submit the first turn.  | “Start with the outcome. AgentCloud proposes only registered capabilities and shows what is missing before anything can run.”                  |
| 22–34s | Add one refinement and show the diff, readiness checks, and immutable hash.       | “Refinements are proposals, not live edits. Each turn has a revision, a readable diff, and an exact hash for review.”                          |
| 34–44s | Save the proposal, choose **Test safely**, and show the dry-run result.            | “Saving creates an immutable version but does not deploy it. Safe simulation follows the real reasoning path and suppresses every write.”      |
| 44–56s | Deploy and choose **Run now**. Follow the run timeline until it pauses.           | “Deployment is explicit. The worker records each decision, performs allowed actions once, and pauses at the approval boundary.”               |
| 56–67s | Open the approval, show the redacted email preview, and approve.                  | “The approval is bound to the exact action and input. The operator can inspect the request without exposing credentials.”                     |
| 67–78s | Return to the run timeline and show completion.                                   | “Approval resumes the same checkpoint. Completed steps are not replayed, so retries cannot duplicate prior effects.”                         |
| 78–86s | Open **Improve worker**, show the new version, then show rollback.                 | “Improvement creates another immutable version. The active deployment changes only when you deploy or roll back explicitly.”                  |
| 86–90s | Return to the product page with demo and GitHub links visible.                    | “The dashboard and authenticated MCP expose the same governed lifecycle. The demo is deterministic and credential-free.”                     |

### Recording acceptance checklist

- The run visibly transitions from running to waiting for approval, then to completed.
- The approval resumes the original run rather than creating a replacement.
- The timeline shows no duplicate side effect.
- The dry-run is clearly labeled and shows no writes executed.
- The builder shows the proposal diff, readiness, revision, and exact spec hash before saving.
- Saving the proposal and deploying it are visibly separate actions.
- The final frame includes both the demo and repository URLs.
- No credentials, personal data, internal organization IDs, or unredacted customer content are visible.
- Captions match actual behavior and make no unverified deployment or integration claim.

## Launch sequence

1. Make CI green and verify the full test contract.
2. Publish the product page with a primary demo action and a secondary GitHub action.
3. Set the repository homepage, topics, description, and social preview.
4. Record the verified lifecycle using the script above.
5. Publish a tagged release with the recording, demo URL, test evidence, and known credential-dependent steps.
6. Share the social post and community post, then direct technical discussion to focused GitHub issues.
7. Publish to the official MCP Registry only after a real HTTPS MCP endpoint and OAuth flow have been verified end to end.

## Suggested repository topics

`mcp`, `model-context-protocol`, `ai-agents`, `agentic-workflows`, `human-in-the-loop`, `workflow-automation`, `typescript`, `nextjs`, `ai-safety`, `multi-tenant`

## Feedback prompts

- Does the builder make the WorkerSpec, readiness, and authority understandable before deployment?
- Is the approval preview sufficient to make a confident decision?
- Does the run timeline explain why the worker paused and how it resumed?
- Which integration deserves the first credential-backed production verification?
- What evidence would you need before allowing this worker to operate in your organization?
