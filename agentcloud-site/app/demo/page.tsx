import type { Metadata } from "next";
import Link from "next/link";
import { DemoControlPlane } from "./demo-control-plane";

export const metadata: Metadata = {
  title: "Interactive demo — AgentCloud",
  description: "Build, refine, simulate, govern, deploy, approve, and roll back an AgentCloud worker in a deterministic browser demo with no real external writes.",
};

export default function DemoPage() {
  return (
    <main className="demo-shell">
      <header className="demo-header">
        <Link className="brand" href="/" aria-label="Back to AgentCloud overview">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          AgentCloud
        </Link>
        <div className="demo-header-links">
          <a className="demo-back" href="https://github.com/premhiru/agentcloud" target="_blank" rel="noreferrer">GitHub</a>
          <Link className="demo-back" href="/">← Product overview</Link>
        </div>
      </header>

      <section className="demo-intro">
        <div>
          <p className="eyebrow"><span /> Interactive browser demo</p>
          <h1>Build the worker.<br /><em>Keep every decision visible.</em></h1>
        </div>
        <p>
          Describe, refine, and operate the canonical inbound-sales worker with deterministic fixtures.
          Nothing here connects to real accounts or performs external writes.
        </p>
      </section>

      <DemoControlPlane />
    </main>
  );
}
