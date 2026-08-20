"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleX,
  GitCompareArrows,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  PlugZap,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import type { BuilderSession } from "@/application/builder/session";
import type { WorkerProposal } from "@/application/builder/proposal";
import { StatusBadge } from "@/components/status-badge";

type SessionResponse = { session?: BuilderSession; code?: string };
type CommitResponse = { workerId?: string; code?: string };

const internalConstraintMarker = "\n\n[AgentCloud builder constraints]\n";

function visibleMessage(content: string): string {
  return content.split(internalConstraintMarker, 1)[0]?.trim() ?? content;
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll(".", " · ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatProvider(provider: string): string {
  return provider === "gmail" ? "Gmail" : provider === "hubspot" ? "HubSpot" : titleCase(provider);
}

function apiError(code?: string): string {
  switch (code) {
    case "BUILDER_SESSION_NOT_FOUND": return "This builder session could not be found in the current workspace.";
    case "BUILDER_REVISION_CONFLICT": return "The design changed in another tab. We reloaded the latest version; review it before continuing.";
    case "BUILDER_SESSION_CLOSED": return "This builder session is already closed.";
    case "BUILDER_PROPOSAL_CHANGED": return "The proposal changed before it could be saved. Review the latest version and try again.";
    case "RATE_LIMIT_EXCEEDED": return "You have sent several refinements recently. Wait a moment, then try again.";
    case "VALIDATION_FAILED": return "Check your message and try again.";
    default: return "AgentCloud could not complete that request. Nothing was saved or run; please try again.";
  }
}

function readinessTone(status: "passed" | "warning" | "blocked") {
  if (status === "passed") return { Icon: CheckCircle2, icon: "text-emerald-700", box: "bg-emerald-50" };
  if (status === "warning") return { Icon: CircleAlert, icon: "text-amber-700", box: "bg-amber-50" };
  return { Icon: CircleX, icon: "text-red-700", box: "bg-red-50" };
}

function Conversation({ session }: { session: BuilderSession }) {
  const proposalsByRevision = useMemo(
    () => new Map(session.proposals.map((revision) => [revision.revision, revision.proposal])),
    [session.proposals],
  );

  return <div className="space-y-5">
    {session.messages.map((message) => {
      const proposal = proposalsByRevision.get(message.sequence);
      return <div key={message.id} className="space-y-3">
        <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-[var(--foreground)] px-4 py-3 text-white sm:max-w-[82%]">
          <div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-white/65"><UserRound size={14} />You</div>
          <p className="whitespace-pre-wrap text-sm leading-6">{visibleMessage(message.content)}</p>
        </div>
        {proposal && <div className="max-w-[96%] rounded-2xl rounded-bl-md border border-[var(--line)] bg-white px-4 py-4 sm:max-w-[88%]">
          <div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-[var(--accent)]"><Bot size={15} />AgentCloud · proposal {message.sequence}</div>
          <p className="text-sm font-bold leading-6">{proposal.summary}</p>
          <p className="muted mt-2 text-xs leading-5">{proposal.readiness.ready ? "The design is ready to save and can be prepared for deployment." : "The design is safe to save as a draft. Resolve the readiness items before deployment."}</p>
        </div>}
      </div>;
    })}
  </div>;
}

function ReadinessPanel({ proposal }: { proposal: WorkerProposal }) {
  return <section className="card p-5" aria-labelledby="readiness-heading">
    <div className="flex items-start justify-between gap-3">
      <div><p className="eyebrow">Readiness</p><h2 id="readiness-heading" className="mt-2 text-lg font-black">{proposal.readiness.ready ? "Ready for the next step" : "Needs your attention"}</h2></div>
      <StatusBadge status={proposal.readiness.ready ? "READY" : "DRAFT"} />
    </div>
    <div className="mt-4 space-y-2">
      {proposal.readiness.checks.map((check) => {
        const tone = readinessTone(check.status);
        return <div key={check.id} className={`flex gap-3 rounded-xl p-3 ${tone.box}`}>
          <tone.Icon className={`mt-0.5 shrink-0 ${tone.icon}`} size={17} />
          <div><p className="text-sm font-extrabold">{check.title}</p><p className="muted mt-1 text-xs leading-5">{check.detail}</p></div>
        </div>;
      })}
    </div>
  </section>;
}

function AttentionPanel({ proposal }: { proposal: WorkerProposal }) {
  const entries = [
    ...proposal.questions.map((text) => ({ label: "Decision needed", text, tone: "text-red-800 bg-red-50" })),
    ...proposal.missingConnections.map((provider) => ({ label: "Connection needed", text: `Connect ${formatProvider(provider)} before deployment.`, tone: "text-amber-900 bg-amber-50" })),
    ...proposal.warnings.map((text) => ({ label: "Compiler note", text, tone: "text-amber-900 bg-amber-50" })),
    ...proposal.unsupportedCapabilities.map((text) => ({ label: "Unsupported capability", text, tone: "text-red-800 bg-red-50" })),
  ];
  if (!entries.length) return null;

  return <section className="card p-5" aria-labelledby="attention-heading">
    <p className="eyebrow">Before deployment</p><h2 id="attention-heading" className="mt-2 text-lg font-black">Resolve these items</h2>
    <div className="mt-4 space-y-2">{entries.map((entry, index) => <div key={`${entry.label}-${entry.text}-${index}`} className={`rounded-xl p-3 ${entry.tone}`}><p className="text-xs font-black uppercase tracking-wide">{entry.label}</p><p className="mt-1 text-sm leading-6">{entry.text}</p></div>)}</div>
    {proposal.missingConnections.length > 0 && <Link href="/connections" className="button button-secondary mt-4 w-full"><PlugZap size={16} />Manage connections</Link>}
  </section>;
}

function ProposalPanel({ proposal }: { proposal: WorkerProposal }) {
  const spec = proposal.spec;
  return <section className="card p-5" aria-labelledby="proposal-heading">
    <p className="eyebrow">Current proposal</p>
    <h2 id="proposal-heading" className="mt-2 text-xl font-black">{spec.identity.name}</h2>
    <p className="muted mt-2 text-sm leading-6">{spec.identity.description}</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-slate-50 p-3"><p className="muted text-xs font-extrabold uppercase tracking-wide">Triggers</p><p className="mt-1 text-sm font-bold">{spec.triggers.map((trigger) => titleCase(trigger.type)).join(" + ")}</p></div>
      <div className="rounded-xl bg-slate-50 p-3"><p className="muted text-xs font-extrabold uppercase tracking-wide">Per-run limit</p><p className="mt-1 text-sm font-bold">${spec.budget.perRunUsd.toFixed(2)} · {spec.budget.maxToolCallsPerRun} tool calls</p></div>
      <div className="rounded-xl bg-slate-50 p-3"><p className="muted text-xs font-extrabold uppercase tracking-wide">Memory</p><p className="mt-1 text-sm font-bold">{spec.memory.enabled ? `${spec.memory.retentionDays} days` : "Off"}</p></div>
      <div className="rounded-xl bg-slate-50 p-3"><p className="muted text-xs font-extrabold uppercase tracking-wide">Connections</p><p className="mt-1 text-sm font-bold">{proposal.requiredConnections.length ? proposal.requiredConnections.map(formatProvider).join(" · ") : "None"}</p></div>
    </div>
    <details className="mt-4 rounded-xl border border-[var(--line)] p-4">
      <summary className="cursor-pointer text-sm font-extrabold">Instructions ({spec.instructions.length})</summary>
      <ol className="muted mt-3 list-decimal space-y-2 pl-5 text-sm leading-6">{spec.instructions.map((instruction, index) => <li key={`${instruction}-${index}`}>{instruction}</li>)}</ol>
    </details>
  </section>;
}

function AuthorityPanel({ proposal }: { proposal: WorkerProposal }) {
  const rules = new Map(proposal.spec.authority.rules.map((rule) => [rule.capability, rule]));
  return <section className="card p-5" aria-labelledby="authority-heading">
    <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Agent Authority</p><h2 id="authority-heading" className="mt-2 text-lg font-black">Explicit permission, default deny</h2></div><LockKeyhole className="text-[var(--accent)]" size={22} /></div>
    <div className="mt-4 divide-y divide-[var(--line)]">
      {proposal.spec.capabilities.map(({ capability }) => {
        const rule = rules.get(capability);
        const status = rule?.effect === "allow" ? "ALLOWED" : rule?.effect === "require_approval" ? "PENDING" : "DENIED";
        return <div key={capability} className="py-3">
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-extrabold">{titleCase(capability)}</p><p className="muted mt-1 text-xs">{capability}</p></div><StatusBadge status={status} /></div>
          {rule?.constraints && <p className="muted mt-2 text-xs leading-5">Limits: {rule.constraints.maxPerDay ? `${rule.constraints.maxPerDay}/day` : "bounded by run budget"}{rule.constraints.allowedDomains?.length ? ` · allowed domains ${rule.constraints.allowedDomains.join(", ")}` : ""}{rule.constraints.blockedDomains?.length ? ` · blocked domains ${rule.constraints.blockedDomains.join(", ")}` : ""}</p>}
        </div>;
      })}
      {!proposal.spec.capabilities.length && <p className="muted py-4 text-sm">This worker has no integration capabilities.</p>}
    </div>
    <div className="mt-4 flex gap-3 rounded-xl bg-[var(--accent-soft)] p-3 text-[var(--accent-strong)]"><ShieldCheck className="mt-0.5 shrink-0" size={17} /><p className="text-xs font-bold leading-5">Everything not listed above is denied. High-risk external actions cannot bypass human approval.</p></div>
  </section>;
}

function DiffPanel({ proposal }: { proposal: WorkerProposal }) {
  return <section className="card p-5" aria-labelledby="diff-heading">
    <div className="flex items-center gap-3"><GitCompareArrows className="text-[var(--accent)]" size={20} /><div><p className="eyebrow">Version diff</p><h2 id="diff-heading" className="mt-1 text-lg font-black">What will be saved</h2></div></div>
    <div className="mt-4 space-y-2">{proposal.diff.map((change, index) => <div key={`${change.path}-${index}`} className="rounded-xl border border-[var(--line)] p-3"><div className="flex items-center gap-2"><span className="pill">{change.kind}</span><code className="muted break-all text-xs">{change.path}</code></div><p className="mt-2 text-sm leading-6">{change.summary}</p></div>)}</div>
    {!proposal.diff.length && <p className="muted mt-4 text-sm">No changes from the base version.</p>}
    <p className="muted mt-4 break-all text-xs">WorkerSpec hash · {proposal.specHash}</p>
  </section>;
}

export function BuilderWorkspace({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<BuilderSession>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<"refine" | "save">();

  const loadSession = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/worker-builders/${encodeURIComponent(sessionId)}`, { signal, cache: "no-store" });
      const body = await response.json().catch(() => ({})) as SessionResponse;
      if (!response.ok || !body.session) {
        setLoadError(apiError(body.code));
        return;
      }
      setLoadError("");
      setSession(body.session);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadError(apiError());
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadSession(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadSession]);

  const latestProposal = session?.proposals.at(-1)?.proposal;
  const closed = session?.status === "COMMITTED" || session?.status === "ABANDONED";
  const hasChanges = !session?.workerId || Boolean(latestProposal?.diff.length);

  async function refine(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !message.trim() || closed) return;
    setPending("refine");
    setActionError("");
    try {
      const response = await fetch(`/api/worker-builders/${encodeURIComponent(session.id)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: session.revision, message: message.trim() }),
      });
      const body = await response.json().catch(() => ({})) as SessionResponse;
      if (!response.ok || !body.session) {
        setActionError(apiError(body.code));
        if (body.code === "BUILDER_REVISION_CONFLICT") await loadSession();
        return;
      }
      setSession(body.session);
      setMessage("");
    } catch {
      setActionError(apiError());
    } finally {
      setPending(undefined);
    }
  }

  async function saveVersion() {
    if (!session || !latestProposal || closed || !hasChanges) return;
    setPending("save");
    setActionError("");
    try {
      const response = await fetch(`/api/worker-builders/${encodeURIComponent(session.id)}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: session.revision, expectedSpecHash: latestProposal.specHash }),
      });
      const body = await response.json().catch(() => ({})) as CommitResponse;
      if (!response.ok || !body.workerId) {
        setActionError(apiError(body.code));
        if (body.code === "BUILDER_REVISION_CONFLICT" || body.code === "BUILDER_PROPOSAL_CHANGED") await loadSession();
        return;
      }
      router.push(`/workers/${encodeURIComponent(body.workerId)}`);
    } catch {
      setActionError(apiError());
    } finally {
      setPending(undefined);
    }
  }

  if (loading) return <div className="mx-auto flex min-h-[55vh] max-w-7xl items-center justify-center" role="status"><div className="card flex items-center gap-3 px-5 py-4 text-sm font-bold"><LoaderCircle className="animate-spin text-[var(--accent)]" size={18} />Loading your worker design…</div></div>;

  if (loadError || !session || !latestProposal) return <div className="mx-auto max-w-xl py-16"><div className="card p-8 text-center"><CircleAlert className="mx-auto text-amber-600" size={30} /><h1 className="mt-4 text-2xl font-black">Builder could not be opened</h1><p role="alert" className="muted mt-3 text-sm leading-6">{loadError || "This session does not have a proposal to review."}</p><div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><button onClick={() => { setLoading(true); void loadSession(); }} className="button"><RefreshCw size={16} />Try again</button><Link href="/workers/new" className="button button-secondary">Start a new worker</Link></div></div></div>;

  return <div className="mx-auto max-w-7xl">
    <Link href="/workers" className="muted inline-flex items-center gap-2 text-sm font-bold hover:text-[var(--foreground)]"><ArrowLeft size={16} />Workers</Link>
    <div className="mt-4 flex flex-col gap-5 border-b border-[var(--line)] pb-6 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex flex-wrap items-center gap-3"><p className="eyebrow">Worker builder · proposal {session.revision}</p><StatusBadge status={session.status} /></div><h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">{latestProposal.spec.identity.name}</h1><p className="muted mt-3 max-w-3xl leading-7">Refine the outcome in conversation, inspect the exact authority and changes, then save an immutable version. Saving never deploys or runs the worker.</p></div>
      <button onClick={saveVersion} disabled={Boolean(pending) || closed || !hasChanges} title={!hasChanges ? "Refine the worker before saving a new version." : undefined} className="button w-full shrink-0 disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto">
        {pending === "save" ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}{pending === "save" ? "Saving version…" : session.status === "COMMITTED" ? "Version saved" : !hasChanges ? "No changes to save" : "Save version"}
      </button>
    </div>
    {actionError && <div role="alert" aria-live="polite" className="mt-5 flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800"><CircleAlert className="mt-0.5 shrink-0" size={17} />{actionError}</div>}
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(350px,.88fr)]">
      <section className="card flex min-h-[640px] flex-col overflow-hidden" aria-labelledby="conversation-heading">
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4"><MessageSquareText className="text-[var(--accent)]" size={20} /><div><p className="eyebrow">Design conversation</p><h2 id="conversation-heading" className="mt-1 font-black">Refine the worker</h2></div></div>
        <div className="flex-1 overflow-y-auto bg-slate-50/60 p-4 sm:p-5"><Conversation session={session} /></div>
        <form onSubmit={refine} className="border-t border-[var(--line)] bg-white p-4 sm:p-5">
          <label htmlFor="builder-message" className="text-sm font-extrabold">What should change?</label>
          <p id="builder-message-help" className="muted mt-1 text-xs">Ask for a new trigger, tighter limit, different approval rule, or clearer instructions.</p>
          <textarea id="builder-message" aria-describedby="builder-message-help" value={message} onChange={(event) => setMessage(event.target.value)} disabled={Boolean(pending) || closed} maxLength={500} rows={3} placeholder="For example: Only create a CRM contact after I approve it." className="mt-3 w-full resize-y rounded-xl border border-[var(--line)] bg-white p-3 text-sm leading-6 outline-none focus:border-[var(--accent)] disabled:bg-slate-50 disabled:opacity-60" />
          <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="muted text-xs">Each reply creates a reviewable proposal—not a live change.</p><button disabled={Boolean(pending) || closed || !message.trim()} className="button shrink-0 disabled:cursor-not-allowed disabled:opacity-60">{pending === "refine" ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}{pending === "refine" ? "Revising…" : "Revise proposal"}</button></div>
        </form>
      </section>
      <aside className="space-y-5">
        <ReadinessPanel proposal={latestProposal} />
        <AttentionPanel proposal={latestProposal} />
        <ProposalPanel proposal={latestProposal} />
        <AuthorityPanel proposal={latestProposal} />
        <DiffPanel proposal={latestProposal} />
        <div className="card p-5"><div className="flex gap-3"><Check className="mt-0.5 shrink-0 text-[var(--accent)]" size={18} /><div><p className="font-extrabold">Save now, deploy later</p><p className="muted mt-1 text-sm leading-6">{hasChanges ? "Saving creates an immutable version attached to this exact WorkerSpec hash. You will review and deploy it from the worker page." : "This proposal matches the base version. Describe a change before creating another immutable version."}</p></div></div><button onClick={saveVersion} disabled={Boolean(pending) || closed || !hasChanges} className="button mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60">{pending === "save" ? <LoaderCircle className="animate-spin" size={17} /> : <ArrowRight size={17} />}{pending === "save" ? "Saving version…" : hasChanges ? "Save version and review" : "No changes to save"}</button></div>
      </aside>
    </div>
  </div>;
}
