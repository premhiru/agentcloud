"use client";

import { useEffect, useMemo, useState } from "react";

type RunStatus = "NOT_STARTED" | "SUCCEEDED" | "WAITING_FOR_APPROVAL" | "REJECTED";
type StepTone = "complete" | "approval" | "suppressed" | "pending" | "rejected";
type BuilderStage = "DESCRIBE" | "PROPOSAL" | "SAVED";

type TimelineStep = Readonly<{ id: string; title: string; detail: string; tone: StepTone; time: string }>;
type ConversationMessage = Readonly<{ id: string; role: "YOU" | "AGENTCLOUD"; content: string }>;
type Proposal = Readonly<{
  revision: number;
  objective: string;
  change: string | null;
  hash: string;
  summary: string;
}>;
type VersionSnapshot = Readonly<{ number: number; objective: string; hash: string; proposalRevision: number }>;

type DemoState = Readonly<{
  stage: BuilderStage;
  objective: string;
  proposal: Proposal | null;
  conversation: readonly ConversationMessage[];
  versions: readonly VersionSnapshot[];
  draftVersion: number | null;
  activeVersion: number | null;
  paused: boolean;
  rollbackVersion: number | null;
  runNumber: number;
  runStatus: RunStatus;
  mode: "DRY_RUN" | "LIVE" | null;
  pinnedVersion: number | null;
  steps: readonly TimelineStep[];
  approvalDecision: "PENDING" | "APPROVED" | "REJECTED" | null;
  writes: number;
  announcement: string;
}>;

const storageKey = "agentcloud-conversational-demo-v2";
const canonicalObjective = "Qualify every inbound sales enquiry, update the CRM, and prepare a thoughtful follow-up without sending it until a human approves.";
const canonicalSummary = "Watch Gmail for sales enquiries, score each lead, update HubSpot, draft a reply, and notify the sales channel.";

const initialState: DemoState = {
  stage: "DESCRIBE",
  objective: canonicalObjective,
  proposal: null,
  conversation: [],
  versions: [],
  draftVersion: null,
  activeVersion: null,
  paused: false,
  rollbackVersion: null,
  runNumber: 12,
  runStatus: "NOT_STARTED",
  mode: null,
  pinnedVersion: null,
  steps: [],
  approvalDecision: null,
  writes: 0,
  announcement: "Demo ready. Describe an outcome to generate a governed worker proposal.",
};

const dryRunSteps: TimelineStep[] = [
  { id: "read", title: "Lead fixture read", detail: "Maya Chen · Northstar Analytics · 240-seat APAC team", tone: "complete", time: "09:41" },
  { id: "qualify", title: "Lead qualified", detail: "Fit score 87 · budget, region, and buying window matched", tone: "complete", time: "09:41" },
  { id: "crm", title: "CRM update suppressed", detail: "Would upsert maya.chen@northstar.co exactly once", tone: "suppressed", time: "09:42" },
  { id: "email", title: "Email send suppressed", detail: "Would pause for approval before external outreach", tone: "suppressed", time: "09:42" },
  { id: "slack", title: "Slack post suppressed", detail: "Would notify #inbound-sales with the qualification summary", tone: "suppressed", time: "09:42" },
  { id: "done", title: "Safe test complete", detail: "Full path inspected · zero writes · deterministic fixtures only", tone: "complete", time: "09:42" },
];

const waitingSteps: TimelineStep[] = [
  { id: "read", title: "Lead fixture read", detail: "Maya Chen · Northstar Analytics · maya.chen@northstar.co", tone: "complete", time: "09:41" },
  { id: "qualify", title: "Lead qualified", detail: "Fit score 87 · enterprise analytics use case", tone: "complete", time: "09:41" },
  { id: "crm", title: "CRM contact updated", detail: "One idempotent simulated HubSpot write", tone: "complete", time: "09:42" },
  { id: "draft", title: "Outreach drafted", detail: "Personalized reply based only on approved account context", tone: "complete", time: "09:42" },
  { id: "approval", title: "Approval required", detail: "Send email to maya.chen@northstar.co", tone: "approval", time: "Now" },
  { id: "resume", title: "Resume checkpoint", detail: "The same run is waiting for a human decision", tone: "pending", time: "—" },
];

function deterministicHash(value: string): string {
  return Array.from({ length: 8 }, (_, index) => {
    let hash = (0x811c9dc5 ^ (index * 0x9e3779b9)) >>> 0;
    for (let cursor = 0; cursor < value.length; cursor += 1) {
      hash ^= value.charCodeAt(cursor) + index;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }).join("");
}

function createProposal(objective: string, revision: number, change: string | null): Proposal {
  const normalized = objective.trim().slice(0, 500);
  const boundedChange = change?.trim().slice(0, 240) || null;
  return {
    revision,
    objective: normalized,
    change: boundedChange,
    hash: deterministicHash(JSON.stringify({ schemaVersion: "1.0", objective: normalized, change: boundedChange, revision })),
    summary: boundedChange ? `${canonicalSummary} Latest refinement: ${boundedChange}` : canonicalSummary,
  };
}

function parseStoredState(value: string | null): DemoState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<DemoState>;
    if (!parsed || !Array.isArray(parsed.steps) || !Array.isArray(parsed.versions) || !Array.isArray(parsed.conversation)) return null;
    return { ...initialState, ...parsed };
  } catch {
    return null;
  }
}

function statusLabel(status: RunStatus) {
  if (status === "NOT_STARTED") return "No active run";
  return status.replaceAll("_", " ");
}

function stepMark(tone: StepTone) {
  if (tone === "complete") return "✓";
  if (tone === "suppressed") return "○";
  if (tone === "approval") return "!";
  if (tone === "rejected") return "×";
  return "·";
}

export function DemoControlPlane() {
  const [state, setState] = useState<DemoState>(initialState);
  const [refinement, setRefinement] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = parseStoredState(window.localStorage.getItem(storageKey));
    const hydrationTimer = window.setTimeout(() => {
      if (stored) setState(stored);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [hydrated, state]);

  const runId = useMemo(() => `RUN-${String(state.runNumber).padStart(3, "0")}`, [state.runNumber]);
  const draft = state.versions.find((version) => version.number === state.draftVersion) ?? null;
  const active = state.versions.find((version) => version.number === state.activeVersion) ?? null;
  const canTest = draft !== null && state.stage === "SAVED";
  const canDeploy = draft !== null && state.stage === "SAVED" && draft.number !== state.activeVersion;
  const canRun = active !== null && !state.paused && state.runStatus !== "WAITING_FOR_APPROVAL";
  const workerStatus = state.paused ? "PAUSED" : active ? "DEPLOYED" : state.proposal ? "DRAFT" : "DESIGNING";

  function generateProposal() {
    const objective = state.objective.trim().slice(0, 500);
    if (objective.length < 20) return;
    const proposal = createProposal(objective, 1, null);
    setState((current) => ({
      ...current,
      stage: "PROPOSAL",
      proposal,
      conversation: [
        { id: "objective-1", role: "YOU", content: objective },
        { id: "proposal-1", role: "AGENTCLOUD", content: "I generated a validated WorkerSpec proposal with explicit capabilities, approval boundaries, and default-deny authority." },
      ],
      announcement: "Proposal revision 1 generated. Review its readiness, authority, and exact hash.",
    }));
  }

  function refineProposal() {
    const message = refinement.trim().slice(0, 240);
    if (!state.proposal || message.length < 3) return;
    const proposal = createProposal(state.proposal.objective, state.proposal.revision + 1, message);
    setState((current) => ({
      ...current,
      stage: "PROPOSAL",
      proposal,
      conversation: [
        ...current.conversation,
        { id: `refine-user-${proposal.revision}`, role: "YOU", content: message },
        { id: `refine-agent-${proposal.revision}`, role: "AGENTCLOUD", content: `Revision ${proposal.revision} applies that constraint while preserving approval and default-deny safeguards.` },
      ],
      announcement: `Proposal revision ${proposal.revision} validated. No worker version changed.`,
    }));
    setRefinement("");
  }

  function saveVersion() {
    if (!state.proposal) return;
    setState((current) => {
      if (!current.proposal) return current;
      const number = Math.max(0, ...current.versions.map((version) => version.number)) + 1;
      const version: VersionSnapshot = { number, objective: current.proposal.objective, hash: current.proposal.hash, proposalRevision: current.proposal.revision };
      return {
        ...current,
        stage: "SAVED",
        versions: [...current.versions, version],
        draftVersion: number,
        announcement: `Immutable WorkerSpec version ${number} saved. It is not deployed and cannot run live yet.`,
      };
    });
  }

  function testSafely() {
    if (!draft) return;
    setState((current) => ({
      ...current,
      runNumber: current.runNumber + 1,
      runStatus: "SUCCEEDED",
      mode: "DRY_RUN",
      pinnedVersion: draft.number,
      steps: dryRunSteps,
      approvalDecision: null,
      writes: 0,
      announcement: `Safe test of version ${draft.number} completed. Every proposed write was suppressed.`,
    }));
  }

  function deployDraft() {
    if (!draft || draft.number === state.activeVersion) return;
    setState((current) => ({
      ...current,
      activeVersion: draft.number,
      paused: false,
      rollbackVersion: current.activeVersion,
      runStatus: "NOT_STARTED",
      mode: null,
      pinnedVersion: null,
      steps: [],
      approvalDecision: null,
      writes: 0,
      announcement: `WorkerSpec version ${draft.number} explicitly deployed. New runs now pin to this immutable version.`,
    }));
  }

  function runNow() {
    if (!active || !canRun) return;
    setState((current) => ({
      ...current,
      runNumber: current.runNumber + 1,
      runStatus: "WAITING_FOR_APPROVAL",
      mode: "LIVE",
      pinnedVersion: active.number,
      steps: waitingSteps,
      approvalDecision: "PENDING",
      writes: 1,
      announcement: `Live run pinned to version ${active.number} and paused at the email approval checkpoint.`,
    }));
  }

  function togglePause() {
    if (!active || state.runStatus === "WAITING_FOR_APPROVAL") return;
    setState((current) => ({
      ...current,
      paused: !current.paused,
      announcement: current.paused
        ? `Worker resumed. New runs continue to pin immutable version ${active.number}.`
        : `Worker paused. New triggers are blocked while version ${active.number} remains deployed.`,
    }));
  }

  function approve() {
    if (state.approvalDecision !== "PENDING") return;
    setState((current) => ({
      ...current,
      runStatus: "SUCCEEDED",
      approvalDecision: "APPROVED",
      writes: 3,
      steps: [
        ...current.steps.filter((step) => step.id !== "approval" && step.id !== "resume"),
        { id: "approval", title: "Action approved", detail: "Exact request hash 8fa2…c91d verified", tone: "complete", time: "09:44" },
        { id: "email", title: "Email sent", detail: "One idempotent simulated Gmail write", tone: "complete", time: "09:44" },
        { id: "slack", title: "Sales team notified", detail: "One simulated post to #inbound-sales", tone: "complete", time: "09:44" },
        { id: "done", title: "Same run succeeded", detail: `${runId} resumed · no earlier work replayed`, tone: "complete", time: "09:44" },
      ],
      announcement: `Approval accepted. ${runId} resumed from its checkpoint with no duplicate side effects.`,
    }));
  }

  function reject() {
    if (state.approvalDecision !== "PENDING") return;
    setState((current) => ({
      ...current,
      runStatus: "REJECTED",
      approvalDecision: "REJECTED",
      steps: [
        ...current.steps.filter((step) => step.id !== "approval" && step.id !== "resume"),
        { id: "approval", title: "Action rejected", detail: "Email and Slack actions were not performed; the run stopped safely", tone: "rejected", time: "09:44" },
      ],
      announcement: `Approval rejected. ${runId} stopped without sending an email or replaying the CRM update.`,
    }));
  }

  function improveWorker() {
    if (!active) return;
    const proposal = createProposal(active.objective, (state.proposal?.revision ?? 0) + 1, "Add a concise audit note to every qualified lead.");
    setState((current) => ({
      ...current,
      stage: "PROPOSAL",
      objective: active.objective,
      proposal,
      conversation: [
        { id: `improve-${proposal.revision}`, role: "YOU", content: "Improve this worker without changing the active deployment." },
        { id: `improve-agent-${proposal.revision}`, role: "AGENTCLOUD", content: `Created proposal revision ${proposal.revision} from active version ${active.number}. Version ${active.number} remains deployed.` },
      ],
      announcement: `Improvement proposal created. Active deployment remains version ${active.number}.`,
    }));
  }

  function rollback() {
    if (state.rollbackVersion === null) return;
    setState((current) => {
      const target = current.rollbackVersion;
      if (target === null) return current;
      return {
        ...current,
        activeVersion: target,
        paused: false,
        rollbackVersion: current.activeVersion,
        runStatus: "NOT_STARTED",
        mode: null,
        pinnedVersion: null,
        steps: [],
        approvalDecision: null,
        writes: 0,
        announcement: `Rolled back deployment to immutable WorkerSpec version ${target}.`,
      };
    });
  }

  function reset() {
    window.localStorage.removeItem(storageKey);
    setRefinement("");
    setState(initialState);
  }

  return (
    <section className="demo-app" aria-label="Interactive AgentCloud demo">
      <div className="demo-notice">
        <span aria-hidden="true">◆</span>
        <div><strong>Safe conversational simulation</strong><p>Device-local state · deterministic fixtures · no external connections or writes</p></div>
        <button type="button" className="text-button" onClick={reset}>Reset demo</button>
      </div>

      <div className="demo-grid conversational-demo-grid">
        <aside className="worker-panel builder-panel">
          <div className="panel-heading">
            <div><p className="mini-label">Describe → validate → save</p><h2>Worker builder</h2></div>
            <span className={`worker-state ${workerStatus.toLowerCase()}`}>{workerStatus}</span>
          </div>

          {state.stage === "DESCRIBE" ? (
            <div className="builder-form">
              <label htmlFor="worker-objective">What outcome should this worker own?</label>
              <textarea id="worker-objective" value={state.objective} maxLength={500} rows={7} onChange={(event) => setState((current) => ({ ...current, objective: event.target.value }))} />
              <p>{state.objective.length}/500 · nothing runs while you design</p>
              <button type="button" className="demo-button primary-action" disabled={state.objective.trim().length < 20} onClick={generateProposal}>Generate validated proposal</button>
            </div>
          ) : (
            <>
              <div className="builder-conversation" aria-label="Builder conversation">
                {state.conversation.map((message) => <div className={`chat-message ${message.role.toLowerCase()}`} key={message.id}><span>{message.role === "YOU" ? "You" : "AgentCloud"}</span><p>{message.content}</p></div>)}
              </div>
              {state.stage === "PROPOSAL" && <div className="builder-form refinement-form">
                <label htmlFor="proposal-refinement">Refine this proposal</label>
                <textarea id="proposal-refinement" value={refinement} maxLength={240} rows={3} placeholder="Example: Cap follow-up emails at ten per day." onChange={(event) => setRefinement(event.target.value)} />
                <p>{refinement.length}/240 · bounded refinement</p>
                <button type="button" className="demo-button" disabled={refinement.trim().length < 3} onClick={refineProposal}>Generate next revision</button>
              </div>}
            </>
          )}

          <dl className="worker-facts">
            <div><dt>Active deployment</dt><dd>{active ? `Version ${active.number}` : "None"}</dd></div>
            <div><dt>Saved draft</dt><dd>{draft ? `Version ${draft.number}` : "None"}</dd></div>
            <div><dt>Authority</dt><dd>Default deny</dd></div>
            <div><dt>External email</dt><dd>Approval required</dd></div>
          </dl>
        </aside>

        <section className="timeline-panel" aria-labelledby="workspace-title">
          <div className="panel-heading timeline-heading">
            <div><p className="mini-label">Proposal and run workspace</p><h2 id="workspace-title">{state.proposal ? `Revision ${state.proposal.revision}` : state.mode ? runId : "No proposal yet"}</h2></div>
            <span className={`run-state ${state.runStatus.toLowerCase()}`}>{statusLabel(state.runStatus)}</span>
          </div>

          {state.proposal ? <div className="proposal-card">
            <div className="proposal-summary"><p className="mini-label">Inbound Sales Guardian</p><h3>{state.proposal.summary}</h3><p>{state.proposal.objective}</p></div>
            <div className="readiness-list" aria-label="Proposal readiness">
              <div><span aria-hidden="true">✓</span><p><strong>Validated WorkerSpec 1.0</strong><small>Curated capabilities only</small></p></div>
              <div><span aria-hidden="true">✓</span><p><strong>Connections ready</strong><small>Simulated Gmail · HubSpot · Slack</small></p></div>
              <div><span aria-hidden="true">✓</span><p><strong>Human decisions resolved</strong><small>External outreach pauses for approval</small></p></div>
            </div>
            <div className="authority-list" aria-label="Default-deny authority">
              <p className="mini-label">Agent Authority · everything else denied</p>
              <div><code>gmail.search_messages</code><span>ALLOW</span></div>
              <div><code>hubspot.upsert_contact</code><span>ALLOW · IDEMPOTENT</span></div>
              <div><code>gmail.send_email</code><span>REQUIRE APPROVAL</span></div>
              <div><code>slack.post_message</code><span>ALLOW AFTER APPROVAL</span></div>
            </div>
            <p className="hash-label">WorkerSpec hash <code>{state.proposal.hash.slice(0, 12)}…{state.proposal.hash.slice(-8)}</code></p>
          </div> : <div className="timeline-empty"><span aria-hidden="true">01</span><h3>Describe the outcome</h3><p>AgentCloud will propose a complete worker without deploying or running it.</p></div>}

          {state.steps.length > 0 && <>
            <div className="run-divider"><p className="mini-label">{state.mode === "DRY_RUN" ? "Safe test" : "Live simulation"}</p><strong>{runId}</strong></div>
            <ol className="demo-timeline">
              {state.steps.map((step) => <li className={step.tone} key={step.id}><span className="demo-node" aria-hidden="true">{stepMark(step.tone)}</span><div><strong>{step.title}</strong><p>{step.detail}</p></div><time>{step.time}</time></li>)}
            </ol>
          </>}

          <div className="timeline-stats">
            <div><span>External writes</span><strong>{state.writes}</strong></div>
            <div><span>Proposal revision</span><strong>{state.proposal?.revision ?? 0}</strong></div>
            <div><span>Run pinned</span><strong>{state.pinnedVersion ? `v${state.pinnedVersion}` : "—"}</strong></div>
          </div>
        </section>

        <aside className="decision-panel">
          <div className="panel-heading"><div><p className="mini-label">Explicit lifecycle</p><h2>Review and operate</h2></div></div>
          <div className="action-stack" aria-label="Worker actions">
            <button type="button" className="demo-button primary-action" disabled={!state.proposal || state.stage !== "PROPOSAL"} onClick={saveVersion}>Save immutable version</button>
            <button type="button" className="demo-button safe" disabled={!canTest} onClick={testSafely}>Test safely <span>Zero writes</span></button>
            <button type="button" className="demo-button primary-action" disabled={!canDeploy} onClick={deployDraft}>Deploy version {draft?.number ?? "—"}</button>
            <button type="button" className="demo-button primary-action" disabled={!canRun} onClick={runNow}>Run now</button>
            <button type="button" className="demo-button" disabled={!active || state.runStatus === "WAITING_FOR_APPROVAL"} onClick={togglePause}>{state.paused ? "Resume worker" : "Pause worker"}</button>
            <button type="button" className="demo-button" disabled={!active || state.runStatus === "WAITING_FOR_APPROVAL"} onClick={improveWorker}>Improve active worker <span>Deployment unchanged</span></button>
            <button type="button" className="demo-button" disabled={state.rollbackVersion === null || state.runStatus === "WAITING_FOR_APPROVAL"} onClick={rollback}>Roll back deployment</button>
          </div>

          {state.approvalDecision === "PENDING" ? <div className="approval-demo-card">
            <span className="approval-icon" aria-hidden="true">!</span><p className="approval-label">Exact action request · {runId}</p><h3>Send outbound email</h3>
            <dl><div><dt>To</dt><dd>maya.chen@northstar.co</dd></div><div><dt>Subject</dt><dd>Northstar analytics evaluation</dd></div><div><dt>Capability</dt><dd>gmail.send_email</dd></div></dl>
            <p className="hash-label">Request hash <code>8fa2…c91d</code></p>
            <div className="approval-actions"><button type="button" className="approve-button" onClick={approve}>Approve and resume same run</button><button type="button" className="reject-button" onClick={reject}>Reject and stop run</button></div>
          </div> : <div className="decision-empty"><span aria-hidden="true">◇</span><h3>{state.approvalDecision === "APPROVED" ? "Action approved" : state.approvalDecision === "REJECTED" ? "Action rejected" : "Nothing needs review"}</h3><p>{state.approvalDecision ? `${runId} records the decision and final outcome.` : "A live run will pause here before its approval-required email."}</p></div>}
        </aside>
      </div>

      <p className="sr-announcement" aria-live="polite" aria-atomic="true">{state.announcement}</p>
    </section>
  );
}
