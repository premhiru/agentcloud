# AgentCloud launch kit

This kit presents AgentCloud as a control plane for governed, persistent AI workers. It deliberately distinguishes the credential-free demo from production integrations that require operator-owned accounts.

## Positioning

**Category:** governed agent infrastructure

**One-line description:** AgentCloud turns an objective into a versioned worker that can run independently, pause for human approval, resume safely, and expose the same lifecycle through an authenticated MCP.

**Short pitch:** Most agent demos disappear with the chat that created them. AgentCloud makes workers durable and governable: immutable versions, default-deny authority, dry-runs that suppress writes, approval checkpoints, idempotent side effects, tenant isolation, and a complete run timeline. The dashboard and MCP share one lifecycle, so humans and AI clients operate the same system of record.

**Why it is different:**

- It governs the action, not just the prompt.
- It persists workers and runs independently of the initiating conversation.
- It proves sensitive behavior with deterministic tests and adapters.
- It gives operators an exact, resumable approval checkpoint instead of an informal confirmation message.
- It treats an MCP server as an authenticated control surface, not as an unrestricted bag of tools.

## Message hierarchy

1. **Persistent:** deploy once; trigger, observe, pause, resume, version, and roll back later.
2. **Governed:** default-deny capability grants and deterministic policy checks precede every tool call.
3. **Human-controlled:** sensitive actions pause with a redacted preview and resume the exact run after a decision.
4. **Safe to evaluate:** dry-runs preserve the lifecycle while suppressing writes; the public demo uses deterministic adapters.
5. **Built for operations:** immutable versions, tenant-scoped persistence, idempotency, audit history, and one dashboard/MCP lifecycle.

## Proof points

Use these concrete claims in product copy and demonstrations:

- Every run is pinned to an immutable WorkerSpec version.
- Unknown or ungranted capabilities are denied by default.
- Dry-runs return structured “would execute” events without calling write adapters.
- Approval records bind the capability and input to a canonical request hash.
- Resuming after approval continues from a stored checkpoint instead of replaying completed work.
- Stable idempotency keys prevent duplicate external effects across retries and resumes.
- Every tenant-owned operation requires an organization ID.
- The authenticated MCP exposes the same lifecycle as the dashboard.

Do not claim live Gmail, HubSpot, Slack, Clerk OAuth, Trigger.dev Cloud, OpenAI, Vercel, or registry verification until it has been completed with operator-owned credentials.

## Ready-to-publish copy

### GitHub description

Persistent AI workers with default-deny authority, human approvals, dry-runs, and an authenticated MCP.

### Social post

Agent demos are easy. Operating them safely after the conversation ends is the hard part.

AgentCloud is an open-source control plane for persistent AI workers: immutable versions, default-deny authority, write-safe dry-runs, human approval checkpoints, idempotent side effects, tenant isolation, and one lifecycle through the dashboard and MCP.

Try the deterministic demo: https://agentcloud-control-plane.premhiru.chatgpt.site/demo

Explore the code: https://github.com/premhiru/agentcloud

### Community post

I built AgentCloud to explore a question: what does an AI worker need after the chat that created it is gone?

The answer was less “more autonomy” and more operational discipline. A worker should have an immutable specification, explicit authority, a safe test mode, durable checkpoints, human approval for sensitive actions, idempotent writes, tenant isolation, and a timeline that explains what happened. AgentCloud implements that lifecycle in a dashboard and exposes it through an authenticated MCP.

The public demo is deterministic and credential-free. It runs an inbound-sales worker, pauses before a sensitive email, and resumes the same run after approval without duplicating prior effects.

Demo: https://agentcloud-control-plane.premhiru.chatgpt.site/demo

Repository: https://github.com/premhiru/agentcloud

I would especially value feedback on the WorkerSpec, authority model, and approval-resume contract.

### Launch title options

- AgentCloud: governed workers that outlive the conversation
- Open-source control plane for persistent AI workers
- From agent demo to governed, resumable worker

## 75-second demo script

Use a clean browser profile at a desktop viewport. Keep the cursor still between actions, crop out personal browser UI, and do not show environment values or account identifiers.

| Time   | Screen and action                                                               | Narration                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–7s   | Product page hero. Point to **Try the interactive demo**.                       | “Most agents stop when the chat closes. AgentCloud turns an objective into a persistent worker with explicit authority.”                      |
| 7–17s  | Open the Inbound Sales Worker and briefly show its version and authority rules. | “Every deployment pins an immutable WorkerSpec. Unknown capabilities are denied, and sensitive actions can require approval.”                 |
| 17–27s | Choose **Test safely** and show the dry-run result.                             | “Before deployment, dry-run executes the workflow but converts writes into structured previews. No write adapter is called.”                  |
| 27–39s | Deploy and choose **Run now**. Follow the run timeline until it pauses.         | “The deployed worker runs independently, records each decision, performs allowed actions once, and pauses at the approval boundary.”          |
| 39–50s | Open the approval, show the redacted email preview, and approve.                | “The approval is bound to the exact action and input. The operator can inspect the request without exposing credentials.”                     |
| 50–62s | Return to the run timeline and show completion.                                 | “Approval resumes the same checkpoint. Completed steps are not replayed, so retries cannot duplicate the CRM update or email.”                |
| 62–70s | Show pause/resume, versions, and rollback controls.                             | “Workers can be paused, resumed, versioned, and rolled back while every run stays attached to its original version.”                          |
| 70–75s | Return to the product page with demo and GitHub links visible.                  | “The dashboard and authenticated MCP expose the same governed lifecycle. Try the deterministic demo or inspect the implementation on GitHub.” |

### Recording acceptance checklist

- The run visibly transitions from running to waiting for approval, then to completed.
- The approval resumes the original run rather than creating a replacement.
- The timeline shows no duplicate side effect.
- The dry-run is clearly labeled and shows no writes executed.
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

- Does the WorkerSpec make the worker's authority understandable before deployment?
- Is the approval preview sufficient to make a confident decision?
- Does the run timeline explain why the worker paused and how it resumed?
- Which integration deserves the first credential-backed production verification?
- What evidence would you need before allowing this worker to operate in your organization?
