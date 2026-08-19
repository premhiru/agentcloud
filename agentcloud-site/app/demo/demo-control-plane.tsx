"use client";

import { useEffect, useMemo, useState } from "react";

type WorkerStatus = "DRAFT" | "DEPLOYED" | "PAUSED";
type RunStatus = "NOT_STARTED" | "SUCCEEDED" | "WAITING_FOR_APPROVAL" | "REJECTED";
type StepTone = "complete" | "approval" | "suppressed" | "pending" | "rejected";

type TimelineStep = Readonly<{
  id: string;
  title: string;
  detail: string;
  tone: StepTone;
  time: string;
}>;

type DemoState = Readonly<{
  workerStatus: WorkerStatus;
  version: number;
  previousVersion: number | null;
  runNumber: number;
  runStatus: RunStatus;
  mode: "DRY_RUN" | "LIVE" | null;
  steps: TimelineStep[];
  approvalDecision: "PENDING" | "APPROVED" | "REJECTED" | null;
  writes: number;
  announcement: string;
}>;

const storageKey = "agentcloud-interactive-demo-v1";

const initialState: DemoState = {
  workerStatus: "DRAFT",
  version: 4,
  previousVersion: null,
  runNumber: 12,
  runStatus: "NOT_STARTED",
  mode: null,
  steps: [],
  approvalDecision: null,
  writes: 0,
  announcement: "Demo ready. Start with a safe test or deploy the worker.",
};

const dryRunSteps: TimelineStep[] = [
  { id: "read", title: "Lead fixture read", detail: "New enquiry from Maya at Northstar", tone: "complete", time: "09:41" },
  { id: "qualify", title: "Lead qualified", detail: "Fit score 87 · budget and region matched", tone: "complete", time: "09:41" },
  { id: "crm", title: "CRM update suppressed", detail: "Would upsert maya@northstar.co", tone: "suppressed", time: "09:42" },
  { id: "email", title: "Email send suppressed", detail: "Would request approval before outreach", tone: "suppressed", time: "09:42" },
  { id: "slack", title: "Slack post suppressed", detail: "Would notify #inbound-sales", tone: "suppressed", time: "09:42" },
  { id: "done", title: "Safe test complete", detail: "Full path inspected · zero writes", tone: "complete", time: "09:42" },
];

const waitingSteps: TimelineStep[] = [
  { id: "read", title: "Lead fixture read", detail: "New enquiry from Maya at Northstar", tone: "complete", time: "09:41" },
  { id: "qualify", title: "Lead qualified", detail: "Fit score 87 · budget and region matched", tone: "complete", time: "09:41" },
  { id: "crm", title: "CRM contact updated", detail: "One idempotent fake CRM write", tone: "complete", time: "09:42" },
  { id: "draft", title: "Outreach drafted", detail: "Personalized from approved account context", tone: "complete", time: "09:42" },
  { id: "approval", title: "Approval required", detail: "Send email to maya@northstar.co", tone: "approval", time: "Now" },
  { id: "resume", title: "Resume checkpoint", detail: "Waiting for a human decision", tone: "pending", time: "—" },
];

function parseStoredState(value: string | null): DemoState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<DemoState>;
    if (!parsed || !Array.isArray(parsed.steps) || typeof parsed.version !== "number") return null;
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
  const canRun = state.workerStatus === "DEPLOYED" && state.runStatus !== "WAITING_FOR_APPROVAL";

  function testSafely() {
    setState((current) => ({
      ...current,
      runNumber: current.runNumber + 1,
      runStatus: "SUCCEEDED",
      mode: "DRY_RUN",
      steps: dryRunSteps,
      approvalDecision: null,
      writes: 0,
      announcement: "Safe test completed. Every proposed write was suppressed.",
    }));
  }

  function deploy() {
    setState((current) => ({
      ...current,
      workerStatus: "DEPLOYED",
      announcement: `WorkerSpec version ${current.version} deployed and ready to run.`,
    }));
  }

  function togglePause() {
    setState((current) => {
      const nextStatus = current.workerStatus === "PAUSED" ? "DEPLOYED" : "PAUSED";
      return {
        ...current,
        workerStatus: nextStatus,
        announcement: nextStatus === "PAUSED" ? "Worker paused. New triggers are blocked." : "Worker resumed and can accept triggers.",
      };
    });
  }

  function runNow() {
    if (!canRun) return;
    setState((current) => ({
      ...current,
      runNumber: current.runNumber + 1,
      runStatus: "WAITING_FOR_APPROVAL",
      mode: "LIVE",
      steps: waitingSteps,
      approvalDecision: "PENDING",
      writes: 1,
      announcement: "Live run paused at the email approval checkpoint.",
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
        { id: "approval", title: "Action approved", detail: "Exact request hash verified", tone: "complete", time: "09:44" },
        { id: "email", title: "Email sent", detail: "One idempotent fake Gmail write", tone: "complete", time: "09:44" },
        { id: "slack", title: "Sales team notified", detail: "One fake post to #inbound-sales", tone: "complete", time: "09:44" },
        { id: "done", title: "Run succeeded", detail: "Checkpoint resumed · no earlier work replayed", tone: "complete", time: "09:44" },
      ],
      announcement: "Approval accepted. The same run resumed and completed with no duplicate effects.",
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
        { id: "approval", title: "Action rejected", detail: "Email was not sent; run stopped safely", tone: "rejected", time: "09:44" },
      ],
      announcement: "Approval rejected. No email or Slack message was sent.",
    }));
  }

  function createVersion() {
    setState((current) => ({
      ...current,
      previousVersion: current.version,
      version: current.version + 1,
      workerStatus: "DRAFT",
      runStatus: "NOT_STARTED",
      mode: null,
      steps: [],
      approvalDecision: null,
      writes: 0,
      announcement: `WorkerSpec version ${current.version + 1} created. Deploy it when ready.`,
    }));
  }

  function rollback() {
    if (state.previousVersion === null) return;
    setState((current) => ({
      ...current,
      version: current.previousVersion ?? current.version,
      previousVersion: null,
      workerStatus: "DEPLOYED",
      runStatus: "NOT_STARTED",
      mode: null,
      steps: [],
      approvalDecision: null,
      writes: 0,
      announcement: `Rolled back and redeployed WorkerSpec version ${current.previousVersion}.`,
    }));
  }

  function reset() {
    window.localStorage.removeItem(storageKey);
    setState(initialState);
  }

  return (
    <section className="demo-app" aria-label="Interactive AgentCloud demo">
      <div className="demo-notice">
        <span aria-hidden="true">◆</span>
        <div><strong>Safe simulation</strong><p>Device-local state · deterministic fixtures · no external connections</p></div>
        <button type="button" className="text-button" onClick={reset}>Reset demo</button>
      </div>

      <div className="demo-grid">
        <aside className="worker-panel">
          <div className="panel-heading">
            <div><p className="mini-label">Canonical worker</p><h2>Inbound Sales Guardian</h2></div>
            <span className={`worker-state ${state.workerStatus.toLowerCase()}`}>{state.workerStatus}</span>
          </div>

          <dl className="worker-facts">
            <div><dt>WorkerSpec</dt><dd>Version {state.version}</dd></div>
            <div><dt>Authority</dt><dd>Default deny</dd></div>
            <div><dt>Email</dt><dd>Approval required</dd></div>
            <div><dt>Run budget</dt><dd>$1.00 max</dd></div>
          </dl>

          <div className="action-stack" aria-label="Worker actions">
            <button type="button" className="demo-button safe" onClick={testSafely}>Test safely <span>Zero writes</span></button>
            {state.workerStatus === "DRAFT" ? (
              <button type="button" className="demo-button primary-action" onClick={deploy}>Deploy version {state.version}</button>
            ) : (
              <button type="button" className="demo-button" onClick={togglePause}>{state.workerStatus === "PAUSED" ? "Resume worker" : "Pause worker"}</button>
            )}
            <button type="button" className="demo-button primary-action" disabled={!canRun} onClick={runNow} title={!canRun ? "Deploy or resume the worker first" : undefined}>Run now</button>
            <button type="button" className="demo-button" onClick={createVersion}>Create new version</button>
            <button type="button" className="demo-button" disabled={state.previousVersion === null} onClick={rollback}>Roll back</button>
          </div>
        </aside>

        <section className="timeline-panel" aria-labelledby="timeline-title">
          <div className="panel-heading timeline-heading">
            <div><p className="mini-label">{state.mode === "DRY_RUN" ? "Safe test" : state.mode === "LIVE" ? "Live simulation" : "Run timeline"}</p><h2 id="timeline-title">{state.mode ? runId : "No run yet"}</h2></div>
            <span className={`run-state ${state.runStatus.toLowerCase()}`}>{statusLabel(state.runStatus)}</span>
          </div>

          {state.steps.length ? (
            <ol className="demo-timeline">
              {state.steps.map((step) => (
                <li className={step.tone} key={step.id}>
                  <span className="demo-node" aria-hidden="true">{stepMark(step.tone)}</span>
                  <div><strong>{step.title}</strong><p>{step.detail}</p></div>
                  <time>{step.time}</time>
                </li>
              ))}
            </ol>
          ) : (
            <div className="timeline-empty">
              <span aria-hidden="true">01</span>
              <h3>Start with a safe test</h3>
              <p>Inspect the full reasoning and tool path before you deploy or allow any write.</p>
            </div>
          )}

          <div className="timeline-stats">
            <div><span>External writes</span><strong>{state.writes}</strong></div>
            <div><span>Model calls</span><strong>{state.mode ? 1 : 0}</strong></div>
            <div><span>Version pinned</span><strong>v{state.version}</strong></div>
          </div>
        </section>

        <aside className="decision-panel">
          <div className="panel-heading"><div><p className="mini-label">Human control</p><h2>Approval</h2></div></div>
          {state.approvalDecision === "PENDING" ? (
            <div className="approval-demo-card">
              <span className="approval-icon" aria-hidden="true">!</span>
              <p className="approval-label">Exact action request</p>
              <h3>Send outbound email</h3>
              <dl>
                <div><dt>To</dt><dd>maya@northstar.co</dd></div>
                <div><dt>Subject</dt><dd>Next steps for Northstar</dd></div>
                <div><dt>Capability</dt><dd>gmail.send_email</dd></div>
              </dl>
              <p className="hash-label">Request hash <code>8fa2…c91d</code></p>
              <div className="approval-actions">
                <button type="button" className="approve-button" onClick={approve}>Approve and resume</button>
                <button type="button" className="reject-button" onClick={reject}>Reject action</button>
              </div>
            </div>
          ) : (
            <div className="decision-empty">
              <span aria-hidden="true">◇</span>
              <h3>{state.approvalDecision === "APPROVED" ? "Action approved" : state.approvalDecision === "REJECTED" ? "Action rejected" : "Nothing needs review"}</h3>
              <p>{state.approvalDecision ? "The decision is recorded in the run timeline." : "A live run will pause here before its approval-required email."}</p>
            </div>
          )}
        </aside>
      </div>

      <p className="sr-announcement" aria-live="polite">{state.announcement}</p>
    </section>
  );
}
