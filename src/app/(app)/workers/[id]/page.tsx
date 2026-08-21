import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft, ArrowUpRight, Check, ChevronRight, CircleAlert, CircleCheck, CircleDashed, Clock3, GitBranch, LockKeyhole, PlugZap } from "lucide-react";

import { getControlPlane } from "@/application/control-plane";
import { ImproveWorkerButton } from "@/components/improve-worker-button";
import { StatusBadge } from "@/components/status-badge";
import { VersionControls } from "@/components/version-controls";
import { WorkerActions } from "@/components/worker-actions";
import { deriveWorkerStudioReadiness, providerLabel, type StudioReadinessCheck } from "@/components/worker-studio-readiness";
import { getCapability } from "@/domain/tool-registry";
import type { AuthorityRule, TriggerSpec } from "@/domain/worker-spec";
import { requirePageTenantContext } from "@/lib/auth/page-tenant-context";

export const dynamic = "force-dynamic";

type LifecycleState = "complete" | "current" | "attention" | "pending";

function lifecycleTone(state: LifecycleState): string {
  if (state === "complete") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "current") return "border-blue-200 bg-blue-50 text-blue-800";
  if (state === "attention") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function readinessTone(status: StudioReadinessCheck["status"]): string {
  if (status === "pass") return "bg-emerald-100 text-emerald-800";
  if (status === "warning") return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

function formatTrigger(trigger: TriggerSpec): { label: string; detail: string } {
  if (trigger.type === "schedule") return { label: "Schedule", detail: `${trigger.cron} · ${trigger.timezone}` };
  if (trigger.type === "webhook") return { label: "Webhook", detail: "Authenticated endpoint" };
  return { label: "Manual", detail: "On demand" };
}

function formatConstraints(rule: AuthorityRule): string | undefined {
  if (!rule.constraints) return undefined;
  const values = [
    rule.constraints.maxPerDay ? `Up to ${rule.constraints.maxPerDay} per day` : undefined,
    rule.constraints.allowedDomains?.length ? `Allowed: ${rule.constraints.allowedDomains.join(", ")}` : undefined,
    rule.constraints.blockedDomains?.length ? `Blocked: ${rule.constraints.blockedDomains.join(", ")}` : undefined,
  ].filter(Boolean);
  return values.length ? values.join(" · ") : undefined;
}

export default async function WorkerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await requirePageTenantContext();
  const controlPlane = await getControlPlane();
  const worker = await controlPlane.getWorker(context, id);
  if (!worker) notFound();

  const [runs, connections] = await Promise.all([controlPlane.listRuns(context, id), controlPlane.listConnections(context)]);
  const latestVersion = worker.versions.at(-1)!;
  const version = worker.versions.find((item) => item.id === worker.activeVersionId) ?? latestVersion;
  const hasUndeployedVersion = worker.status === "DEPLOYED" && latestVersion.id !== worker.activeVersionId;
  const readiness = deriveWorkerStudioReadiness(version.spec, worker.status, connections);
  const deploymentReadiness = hasUndeployedVersion
    ? deriveWorkerStudioReadiness(latestVersion.spec, "READY", connections)
    : readiness;
  const versionRuns = runs.filter((run) => run.workerVersionId === version.id);
  const safeTests = versionRuns.filter((run) => run.mode === "dry_run");
  const hasSuccessfulSafeTest = safeTests.some((run) => run.status === "SUCCEEDED");
  const authorityReady = readiness.checks.filter((check) => check.id === "authority" || check.id === "support").every((check) => check.status === "pass");
  const isActiveDeployment = worker.activeVersionId === version.id && ["DEPLOYED", "PAUSED"].includes(worker.status);
  const lifecycle: { name: string; detail: string; state: LifecycleState }[] = [
    { name: "Define", detail: `WorkerSpec v${version.versionNumber}`, state: "complete" },
    { name: "Govern", detail: authorityReady ? "Default-deny rules set" : "Authority needs review", state: authorityReady ? "complete" : "attention" },
    { name: "Test", detail: hasSuccessfulSafeTest ? "Safe test passed" : "No passing safe test", state: hasSuccessfulSafeTest ? "complete" : "current" },
    { name: "Deploy", detail: isActiveDeployment ? "Version is active" : readiness.readyForDeploy ? "Ready to deploy" : "Readiness blocked", state: isActiveDeployment ? "complete" : readiness.readyForDeploy ? "current" : "pending" },
    { name: "Operate", detail: worker.status === "DEPLOYED" ? "Running" : worker.status === "PAUSED" ? "Paused" : "Not active", state: worker.status === "DEPLOYED" ? "current" : worker.status === "PAUSED" ? "attention" : "pending" },
  ];
  const navigation = [["Overview", "overview"], ["Authority", "authority"], ["Safe test", "safe-test"], ["Runs", "runs"], ["Versions", "versions"]] as const;

  return (
    <div className="mx-auto max-w-7xl pb-16">
      <Link href="/workers" className="muted inline-flex items-center gap-2 text-sm font-bold hover:text-[var(--foreground)]"><ArrowLeft size={15} /> Workers</Link>

      <header className="mt-5 overflow-hidden rounded-3xl border border-[var(--line)] bg-white shadow-[0_24px_70px_rgba(23,49,37,.08)]">
        <div className="border-b border-[var(--line)] px-6 py-7 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3"><p className="eyebrow">Worker Studio</p><StatusBadge status={worker.status} /><span className="pill">v{version.versionNumber}</span></div>
              <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">{worker.name}</h1>
              <p className="muted mt-4 max-w-3xl text-base leading-7">{version.spec.objective}</p>
              <p className="muted mt-3 font-mono text-xs">Spec {version.specHash.slice(0, 12)} · immutable version</p>
            </div>
            <div id="studio-actions" className="flex max-w-xl flex-wrap items-start justify-end gap-2 scroll-mt-24">
              <ImproveWorkerButton workerId={worker.id} disabled={worker.status === "ARCHIVED"} />
              <WorkerActions workerId={worker.id} status={worker.status} hasUndeployedVersion={hasUndeployedVersion} canDeploy={deploymentReadiness.readyForDeploy} deployBlockedReason="Resolve every readiness check for the version being deployed." />
            </div>
          </div>
          {hasUndeployedVersion ? <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"><span><strong>Version {latestVersion.versionNumber}</strong> is saved and waiting to be deployed.</span><Link href="#versions" className="inline-flex items-center gap-1 font-extrabold">Review versions <ArrowUpRight size={14} /></Link></div> : null}
        </div>
        <div className="grid divide-y divide-[var(--line)] lg:grid-cols-[1fr_18rem] lg:divide-x lg:divide-y-0">
          <ol aria-label="Worker lifecycle" className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-5 lg:p-5">
            {lifecycle.map((stage, index) => <li key={stage.name} aria-current={stage.state === "current" ? "step" : undefined} className={`rounded-2xl border px-3 py-3 ${lifecycleTone(stage.state)}`}><div className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-white/80 text-xs font-black">{index + 1}</span><span className="font-extrabold">{stage.name}</span></div><p className="mt-2 text-xs font-semibold opacity-80">{stage.detail}</p></li>)}
          </ol>
          <div className="flex items-center justify-center gap-3 bg-slate-50 px-5 py-4 lg:flex-col lg:items-start"><p className="text-sm font-black">{readiness.readyForDeploy ? "Deployment ready" : "Review readiness"}</p><Link href="#readiness" className="text-xs font-extrabold text-[var(--accent)]">Inspect checks →</Link></div>
        </div>
      </header>

      <nav aria-label="Worker Studio sections" className="nav-scroll sticky top-0 z-10 mt-6 flex gap-1 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white/95 p-1.5 shadow-sm backdrop-blur">
        {navigation.map(([label, anchor]) => <Link key={anchor} href={`#${anchor}`} className="whitespace-nowrap rounded-xl px-4 py-2 text-sm font-extrabold hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)]">{label}</Link>)}
      </nav>

      <main className="mt-6 space-y-6">
        <section id="overview" className="scroll-mt-24">
          <div className="mb-4"><p className="eyebrow">Overview</p><h2 className="mt-2 text-2xl font-black">Definition and runtime envelope</h2></div>
          <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
            <div className="card p-6">
              <div className="flex items-center gap-3"><Clock3 className="text-[var(--accent)]" size={20} /><h3 className="text-lg font-black">Triggers</h3></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">{version.spec.triggers.map((trigger, index) => { const formatted = formatTrigger(trigger); return <div key={`${trigger.type}-${index}`} className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4"><p className="font-extrabold">{formatted.label}</p><p className="muted mt-1 text-sm">{formatted.detail}</p></div>; })}</div>
              <div className="mt-6 flex items-center gap-3"><Check className="text-[var(--accent)]" size={20} /><h3 className="text-lg font-black">Instructions</h3></div>
              <ol className="mt-4 space-y-3">{version.spec.instructions.map((instruction, index) => <li key={`${index}-${instruction}`} className="flex gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6"><span className="mt-0.5 font-black text-[var(--accent)]">{index + 1}</span><span>{instruction}</span></li>)}</ol>
            </div>
            <div className="space-y-5">
              <div className="card p-6">
                <div className="flex items-center gap-3"><PlugZap className="text-[var(--accent)]" size={20} /><h3 className="text-lg font-black">Required providers</h3></div>
                {readiness.requiredProviders.length ? <div className="mt-4 space-y-3">{readiness.requiredProviders.map((provider) => <div key={provider.provider} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] p-3"><div><p className="font-extrabold">{providerLabel(provider.provider)}</p><p className="muted mt-1 text-xs">{provider.connected ? `${provider.capabilities.length} capabilities ready` : `${provider.missingCapabilities.length || provider.capabilities.length} capabilities need access`}</p>{!provider.connected ? <Link href={`/connections?provider=${provider.provider}&returnTo=${encodeURIComponent(`/workers/${worker.id}`)}`} className="mt-2 inline-flex text-xs font-extrabold text-[var(--accent)]">Connect {providerLabel(provider.provider)} →</Link> : null}</div><StatusBadge status={provider.connectionStatus} /></div>)}</div> : <p className="muted mt-4 text-sm">No external provider is required by this version.</p>}
                <Link href="/connections" className="mt-4 inline-flex items-center gap-1 text-sm font-extrabold text-[var(--accent)]">Manage connections <ArrowUpRight size={14} /></Link>
              </div>
              <div className="card p-6">
                <div className="flex items-center gap-3"><Activity className="text-[var(--accent)]" size={20} /><h3 className="text-lg font-black">Runtime limits</h3></div>
                <dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="muted">Per run</dt><dd className="mt-1 font-black">${version.spec.budget.perRunUsd.toFixed(2)}</dd></div><div><dt className="muted">Per month</dt><dd className="mt-1 font-black">${version.spec.budget.monthlyUsd.toFixed(2)}</dd></div><div><dt className="muted">Model calls</dt><dd className="mt-1 font-black">{version.spec.budget.maxModelCallsPerRun}</dd></div><div><dt className="muted">Tool calls</dt><dd className="mt-1 font-black">{version.spec.budget.maxToolCallsPerRun}</dd></div><div><dt className="muted">Max steps</dt><dd className="mt-1 font-black">{version.spec.model.maxSteps}</dd></div><div><dt className="muted">Memory</dt><dd className="mt-1 font-black">{version.spec.memory.enabled ? `${version.spec.memory.retentionDays} days` : "Off"}</dd></div></dl>
              </div>
            </div>
          </div>
        </section>

        <section id="authority" className="card scroll-mt-24 p-6 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Authority</p><h2 className="mt-2 text-2xl font-black">Explicit permission boundary</h2><p className="muted mt-2 max-w-2xl text-sm leading-6">Unknown and unlisted operations are denied. Every granted capability below is evaluated by the policy engine.</p></div><div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-extrabold"><LockKeyhole size={16} /> Default deny</div></div>
          <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--line)]">{version.spec.authority.rules.map((rule) => { const capability = getCapability(rule.capability); const constraints = formatConstraints(rule); return <div key={rule.capability} className="grid gap-3 border-b border-[var(--line)] px-4 py-4 last:border-0 md:grid-cols-[1fr_auto] md:items-center"><div><p className="font-extrabold">{capability?.description ?? rule.capability}</p><p className="muted mt-1 font-mono text-xs">{rule.capability}</p>{constraints ? <p className="mt-2 text-xs font-semibold text-slate-700">{constraints}</p> : null}</div><StatusBadge status={rule.effect === "allow" ? "ALLOWED" : rule.effect === "require_approval" ? "PENDING" : "DENIED"} /></div>; })}</div>
        </section>

        <section id="readiness" className="card scroll-mt-24 p-6 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Readiness</p><h2 className="mt-2 text-2xl font-black">Pre-deployment inspector</h2></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ${readiness.readyForDeploy ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{readiness.readyForDeploy ? "ALL CHECKS PASS" : "ACTION REQUIRED"}</span></div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">{readiness.checks.map((check) => <div key={check.id} className="flex gap-3 rounded-2xl border border-[var(--line)] p-4">{check.status === "pass" ? <CircleCheck className="shrink-0 text-emerald-700" size={20} /> : check.status === "warning" ? <CircleAlert className="shrink-0 text-amber-700" size={20} /> : <CircleDashed className="shrink-0 text-red-700" size={20} />}<div><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">{check.label}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${readinessTone(check.status)}`}>{check.status}</span></div><p className="muted mt-2 text-sm leading-6">{check.detail}</p></div></div>)}</div>
        </section>

        <section id="safe-test" className="card scroll-mt-24 p-6 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Safe test</p><h2 className="mt-2 text-2xl font-black">Validate decisions without writes</h2><p className="muted mt-2 max-w-2xl text-sm leading-6">Dry-run mode follows the worker path while suppressing integration writes. Results remain attached to this exact WorkerSpec version.</p></div><Link href="#studio-actions" className="button button-secondary">Test controls <ArrowUpRight size={15} /></Link></div>
          {safeTests.length ? <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{safeTests.slice(0, 3).map((run) => <Link key={run.id} href={`/runs/${run.id}`} className="rounded-2xl border border-[var(--line)] p-4 hover:border-[var(--accent)]"><div className="flex items-center justify-between gap-3"><p className="font-extrabold">Safe test</p><StatusBadge status={run.status} /></div><p className="muted mt-3 text-xs">{new Date(run.createdAt).toLocaleString()}</p><p className="mt-2 text-sm font-bold">{run.steps.length} timeline steps · ${run.estimatedCostUsd.toFixed(4)}</p></Link>)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm"><p className="font-extrabold">This version has not been safely tested yet.</p><p className="muted mt-1">Use “Test safely” above to generate an observable dry-run timeline.</p></div>}
        </section>

        <section id="runs" className="card scroll-mt-24 p-6 lg:p-8">
          <div><p className="eyebrow">Runs</p><h2 className="mt-2 text-2xl font-black">Operational history</h2></div>
          {runs.length ? <div className="mt-5 divide-y divide-[var(--line)]">{runs.map((run) => <Link key={run.id} href={`/runs/${run.id}`} className="grid gap-3 py-4 hover:text-[var(--accent-strong)] sm:grid-cols-[1fr_auto] sm:items-center"><div className="flex items-start gap-3"><div className="mt-0.5 rounded-xl bg-slate-100 p-2"><Activity size={17} /></div><div><p className="font-extrabold">{run.mode === "dry_run" ? "Safe test" : "Live run"} · {run.triggerType}</p><p className="muted mt-1 text-sm">{new Date(run.createdAt).toLocaleString()} · v{worker.versions.find((item) => item.id === run.workerVersionId)?.versionNumber ?? "?"}</p></div></div><div className="flex items-center gap-3"><StatusBadge status={run.status} /><ChevronRight size={16} /></div></Link>)}</div> : <p className="muted mt-5 rounded-2xl bg-slate-50 p-5 text-sm">No runs yet. A safe test is the recommended first run.</p>}
        </section>

        <section id="versions" className="scroll-mt-24">
          <div className="mb-4"><p className="eyebrow">Versions</p><h2 className="mt-2 text-2xl font-black">Immutable history and rollback</h2></div>
          <div className="grid gap-5 lg:grid-cols-[1fr_.8fr]">
            <div className="card p-6"><div className="flex items-center gap-3"><GitBranch className="text-[var(--accent)]" size={20} /><h3 className="text-lg font-black">Version history</h3></div><div className="mt-5 space-y-3">{[...worker.versions].reverse().map((item) => <div key={item.id} className="rounded-2xl border border-[var(--line)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-extrabold">Version {item.versionNumber}</p><div className="flex gap-2">{latestVersion.id === item.id ? <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-black text-blue-800">LATEST</span> : null}{worker.activeVersionId === item.id ? <span className="pill">Active</span> : null}</div></div><p className="muted mt-2 line-clamp-2 text-sm">{item.spec.objective}</p><p className="muted mt-3 font-mono text-xs">{item.specHash.slice(0, 12)} · {new Date(item.createdAt).toLocaleString()}</p></div>)}</div></div>
            <div className="card p-6"><p className="eyebrow">Restore</p><h3 className="mt-2 text-lg font-black">Roll back the deployment</h3><p className="muted mt-2 text-sm leading-6">The deployed WorkerSpec is never edited in place. Use Improve worker for a new version, or activate an earlier immutable version here.</p><VersionControls workerId={worker.id} versions={worker.versions.map((item) => ({ id: item.id, versionNumber: item.versionNumber }))} activeVersionId={worker.activeVersionId} archived={worker.status === "ARCHIVED"} /></div>
          </div>
        </section>
      </main>
    </div>
  );
}
