const demoUrl = "/demo";
const githubUrl = "https://github.com/premhiru/agentcloud";

const lifecycle = [
  { number: "01", label: "Describe", detail: "Turn an outcome into a reviewable proposal." },
  { number: "02", label: "Simulate", detail: "Exercise the path with every write suppressed." },
  { number: "03", label: "Govern", detail: "Review authority, budgets, readiness, and hash." },
  { number: "04", label: "Deploy", detail: "Activate one exact immutable WorkerSpec." },
  { number: "05", label: "Observe", detail: "Follow runs and resume human checkpoints." },
  { number: "06", label: "Refine", detail: "Create a new version or roll back safely." },
];

const safeguards = [
  { title: "Default-deny authority", detail: "Every integration action must be registered and explicitly granted in the WorkerSpec.", mark: "A" },
  { title: "Write-safe simulation", detail: "Test the complete decision path while external side effects remain impossible.", mark: "D" },
  { title: "Human checkpoints", detail: "Pause before sensitive work, inspect the exact request, then resume the same run.", mark: "H" },
  { title: "Retry-safe effects", detail: "Stable idempotency keys prevent duplicate messages and records across retries.", mark: "I" },
];

function Arrow() { return <span aria-hidden="true">→</span>; }
function Check() { return <span aria-hidden="true">✓</span>; }

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="AgentCloud home"><span className="brand-mark" aria-hidden="true"><span /></span>AgentCloud</a>
        <nav aria-label="Main navigation">
          <a href="#lifecycle">Lifecycle</a><a href="#safety">Safety</a><a href="#mcp">MCP</a>
          <a href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>
          <a className="nav-cta" href={demoUrl}>Try the demo <Arrow /></a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Governed worker infrastructure</p>
          <h1>Built in conversation.<br /><em>Governed in production.</em></h1>
          <p className="hero-lede">Describe a job, review the exact authority, simulate it without writes, and deploy an immutable AI worker that keeps running after the conversation ends.</p>
          <div className="hero-actions">
            <a className="button primary" href={demoUrl}>Build a worker in the demo <Arrow /></a>
            <a className="button secondary" href={githubUrl} target="_blank" rel="noreferrer">View on GitHub <Arrow /></a>
          </div>
          <p className="availability"><span className="pulse" /> Open-source MVP · deterministic public demo</p>
        </div>

        <div className="builder-card" aria-label="Example conversational worker proposal">
          <div className="builder-card-top">
            <div><p className="mini-label">Worker builder · Revision 2</p><p className="run-title">Inbound Sales Guardian</p></div>
            <span className="ready-pill">Ready to save</span>
          </div>
          <div className="builder-thread">
            <div className="builder-message user-message"><small>You</small><p>Require approval before any external email and cap outreach at ten per day.</p></div>
            <div className="builder-message agent-message"><small>AgentCloud</small><p>Updated authority and instructions. The deployment remains unchanged.</p></div>
          </div>
          <div className="readiness-list">
            <div><Check /><span>Capabilities registered</span><strong>9 curated</strong></div>
            <div><Check /><span>Authority explicit</span><strong>Default deny</strong></div>
            <div><Check /><span>Connections ready</span><strong>3 fixtures</strong></div>
          </div>
          <div className="builder-card-footer"><span>Spec hash</span><code>9f3c7a2e…f10c</code><strong>Save immutable version</strong></div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Core guarantees">
        <div><strong>Persistent</strong><span>Workers outlive the chat</span></div><div><strong>Tenant-safe</strong><span>Isolation at every boundary</span></div>
        <div><strong>Observable</strong><span>One continuous timeline</span></div><div><strong>Reversible</strong><span>Version and roll back</span></div>
      </section>

      <section className="section lifecycle-section" id="lifecycle">
        <div className="section-heading"><p className="eyebrow">The operating loop</p><h2>From intent to supervised work.</h2><p>One persistent lifecycle across the Worker Studio and the authenticated AgentCloud MCP.</p></div>
        <div className="lifecycle-grid">{lifecycle.map((item) => <article className="lifecycle-card" key={item.number}><span>{item.number}</span><h3>{item.label}</h3><p>{item.detail}</p></article>)}</div>
      </section>

      <section className="section journey-section">
        <div className="journey-copy">
          <p className="eyebrow light">Canonical demo</p><h2>Inbound sales, without the black box.</h2>
          <p>Build and refine the reference worker, inspect every capability, test the actual path without writes, deploy, pause for an exact email approval, resume, and roll back. Deterministic adapters keep the full path credential-free.</p>
          <a href={demoUrl}>Run the guided lifecycle <Arrow /></a>
        </div>
        <div className="spec-card">
          <div className="spec-header"><span>worker-spec.yaml</span><span className="version">v1 · immutable</span></div>
          <pre aria-label="Example WorkerSpec"><code>{`schemaVersion: "1.0"\nidentity:\n  name: Inbound Sales Guardian\nauthority:\n  defaultEffect: deny\n  rules:\n    - gmail.search_messages: allow\n    - gmail.send_email: require_approval\nbudget:\n  perRunUsd: 1`}</code></pre>
          <div className="spec-footer"><span><Check /> Schema valid</span><span><Check /> Authority reviewed</span></div>
        </div>
      </section>

      <section className="section safety-section" id="safety">
        <div className="section-heading split-heading"><div><p className="eyebrow">Built-in governance</p><h2>Safety lives below the model.</h2></div><p>Authority, isolation, approval integrity, dry-run suppression, and retry behavior are enforced by the control plane—not prompt suggestions.</p></div>
        <div className="safety-grid">{safeguards.map((item) => <article className="safety-card" key={item.title}><span className="safety-mark">{item.mark}</span><h3>{item.title}</h3><p>{item.detail}</p></article>)}</div>
      </section>

      <section className="section mcp-section" id="mcp">
        <div className="mcp-copy"><p className="eyebrow light">Authenticated MCP</p><h2>Your AI client can build. AgentCloud stays in control.</h2><p>Start and refine persistent builder sessions from ChatGPT, Codex, or another OAuth MCP client. The AI gets safe proposal state and stable continuation links; tenant identity, deployment, policy, approvals, and credentials stay server-controlled.</p><a href={githubUrl} target="_blank" rel="noreferrer">Inspect the MCP implementation <Arrow /></a></div>
        <div className="mcp-card" aria-label="AgentCloud MCP builder tool sequence">
          <div><span>01</span><code>start_worker_builder</code><strong>workers:write</strong></div><div><span>02</span><code>refine_worker_builder</code><strong>revision + message</strong></div>
          <div><span>03</span><code>commit_worker_builder</code><strong>exact hash</strong></div><div><span>04</span><code>test_worker</code><strong>zero writes</strong></div><div><span>05</span><code>deploy_worker</code><strong>separate scope</strong></div>
        </div>
      </section>

      <section className="cta-section"><div><p className="eyebrow light">Open the control plane</p><h2>Give AI workers a durable place to work.</h2></div><div className="cta-actions"><a className="button light-button" href={demoUrl}>Launch the interactive demo <Arrow /></a><a className="button cta-github" href={githubUrl} target="_blank" rel="noreferrer">Explore the source <Arrow /></a></div></section>

      <footer><a className="brand footer-brand" href="#top"><span className="brand-mark" aria-hidden="true"><span /></span>AgentCloud</a><p>Describe clearly. Govern explicitly. Deploy immutably.</p><div className="footer-links"><a href={demoUrl}>Interactive demo <Arrow /></a><a href={githubUrl} target="_blank" rel="noreferrer">GitHub <Arrow /></a></div></footer>
    </main>
  );
}
