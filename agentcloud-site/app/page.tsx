const githubUrl = "https://github.com/premhiru/agentcloud";

const lifecycle = [
  { number: "01", label: "Create", detail: "Define a versioned WorkerSpec." },
  { number: "02", label: "Test safely", detail: "Dry-run with every write suppressed." },
  { number: "03", label: "Deploy", detail: "Pin a durable worker version." },
  { number: "04", label: "Approve", detail: "Review the exact proposed action." },
  { number: "05", label: "Observe", detail: "Follow the run timeline end to end." },
];

const safeguards = [
  {
    title: "Default-deny authority",
    detail: "Every integration action must be explicitly granted in the WorkerSpec.",
    mark: "A",
  },
  {
    title: "Dry-run safety",
    detail: "Test the complete decision path while side effects remain impossible.",
    mark: "D",
  },
  {
    title: "Human approvals",
    detail: "Pause before sensitive work, then resume from the same durable run.",
    mark: "H",
  },
  {
    title: "Idempotent effects",
    detail: "Retries reuse the same key, preventing duplicate messages and records.",
    mark: "I",
  },
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
      <path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
      <path d="m3.25 8.25 3 3 6.5-6.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="AgentCloud home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          AgentCloud
        </a>
        <nav aria-label="Main navigation">
          <a href="#lifecycle">Lifecycle</a>
          <a href="#safety">Safety</a>
          <a className="nav-cta" href={githubUrl}>View source <ArrowIcon /></a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Persistent agent infrastructure</p>
          <h1>AI workers that keep going.<br /><em>Governed from day one.</em></h1>
          <p className="hero-lede">
            Create, test, deploy, and supervise durable AI workers with explicit authority,
            human approvals, and a complete operational record.
          </p>
          <div className="hero-actions">
            <a className="button primary" href={githubUrl}>Explore the repository <ArrowIcon /></a>
            <a className="button secondary" href="#lifecycle">See the lifecycle</a>
          </div>
          <p className="availability"><span className="pulse" /> Production-quality MVP · private preview</p>
        </div>

        <div className="run-card" aria-label="Example worker run timeline">
          <div className="run-card-top">
            <div>
              <p className="mini-label">Live run</p>
              <p className="run-title">Inbound Sales Worker</p>
            </div>
            <span className="status-pill">Waiting for approval</span>
          </div>
          <div className="timeline">
            <div className="timeline-row complete">
              <span className="node"><CheckIcon /></span>
              <div><strong>Lead qualified</strong><small>Fit score 87 · fake CRM</small></div>
              <time>09:41</time>
            </div>
            <div className="timeline-row complete">
              <span className="node"><CheckIcon /></span>
              <div><strong>Outreach drafted</strong><small>Personalized from account context</small></div>
              <time>09:42</time>
            </div>
            <div className="timeline-row active">
              <span className="node">!</span>
              <div><strong>Approval required</strong><small>Send email to maya@northstar.co</small></div>
              <time>Now</time>
            </div>
            <div className="timeline-row pending">
              <span className="node" />
              <div><strong>Record outcome</strong><small>Resumes after a decision</small></div>
            </div>
          </div>
          <div className="run-footer">
            <span>Version 4</span><span>Dry-run off</span><span>1 write proposed</span>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Core guarantees">
        <div><strong>Durable</strong><span>Runs outlive the chat</span></div>
        <div><strong>Tenant-safe</strong><span>Isolation at every boundary</span></div>
        <div><strong>Observable</strong><span>One continuous timeline</span></div>
        <div><strong>Reversible</strong><span>Version and roll back</span></div>
      </section>

      <section className="section lifecycle-section" id="lifecycle">
        <div className="section-heading">
          <p className="eyebrow">The operating loop</p>
          <h2>From specification to supervised work.</h2>
          <p>A single lifecycle across the dashboard and the authenticated AgentCloud MCP.</p>
        </div>
        <div className="lifecycle-grid">
          {lifecycle.map((item) => (
            <article className="lifecycle-card" key={item.number}>
              <span>{item.number}</span>
              <h3>{item.label}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section journey-section">
        <div className="journey-copy">
          <p className="eyebrow light">Canonical demo</p>
          <h2>Inbound sales, without the black box.</h2>
          <p>
            The reference worker qualifies a lead, drafts outreach, pauses before sending,
            resumes after approval, and records the outcome. Fake adapters keep the entire
            path deterministic when vendor credentials are unavailable.
          </p>
          <a href={githubUrl}>Inspect the implementation <ArrowIcon /></a>
        </div>
        <div className="spec-card">
          <div className="spec-header"><span>worker-spec.yaml</span><span className="version">v4</span></div>
          <pre aria-label="Example WorkerSpec"><code>{`kind: WorkerSpec\nversion: 1\nworker:\n  name: inbound-sales\n  authority:\n    crm.read: allow\n    email.send: approval\n  runtime: durable\n  tenantIsolation: required`}</code></pre>
          <div className="spec-footer"><span><CheckIcon /> Schema valid</span><span><CheckIcon /> Authority reviewed</span></div>
        </div>
      </section>

      <section className="section safety-section" id="safety">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow">Built-in governance</p>
            <h2>Safety is part of the runtime.</h2>
          </div>
          <p>Authority, isolation, approvals, and retry behavior are enforced infrastructure—not prompt suggestions.</p>
        </div>
        <div className="safety-grid">
          {safeguards.map((item) => (
            <article className="safety-card" key={item.title}>
              <span className="safety-mark">{item.mark}</span>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <div>
          <p className="eyebrow light">Open the control plane</p>
          <h2>Give agents a durable place to work.</h2>
        </div>
        <a className="button light-button" href={githubUrl}>View AgentCloud on GitHub <ArrowIcon /></a>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark" aria-hidden="true"><span /></span>AgentCloud</a>
        <p>Persistent workers. Explicit authority. Human control.</p>
        <a href={githubUrl}>GitHub <ArrowIcon /></a>
      </footer>
    </main>
  );
}
