import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the AgentCloud product page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>AgentCloud/);
  assert.match(html, /Built in conversation/);
  assert.match(html, /Worker builder/);
  assert.match(html, /Ready to save/);
  assert.match(html, /Authenticated MCP/);
  assert.match(html, /Default-deny authority/);
  assert.match(html, /gmail.send_email/);
  assert.match(html, /href="\/demo"/);
  assert.match(html, /https:\/\/github\.com\/premhiru\/agentcloud/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("server-renders a usable interactive demo route", async () => {
  const response = await render("/demo");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Interactive demo/);
  assert.match(html, /What outcome should this worker own/);
  assert.match(html, /Generate validated proposal/);
  assert.match(html, /Save immutable version/);
  assert.match(html, /Test safely/);
  assert.match(html, /Deploy version/);
  assert.match(html, /Run now/);
  assert.match(html, /Pause worker/);
  assert.match(html, /Improve active worker/);
  assert.match(html, /https:\/\/github\.com\/premhiru\/agentcloud/);
  assert.match(html, /Nothing here connects to real accounts or performs external writes/);
});

test("ships production metadata and responsive styling", async () => {
  const [layout, page, demo, css, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demo/demo-control-plane.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /openGraph:/);
  assert.match(layout, /\/og-builder\.png/);
  assert.match(page, /aria-label="Example conversational worker proposal"/);
  assert.match(page, /gmail\.send_email: require_approval/);
  assert.match(demo, /window\.localStorage/);
  assert.match(demo, /approvalDecision/);
  assert.match(demo, /writes: 0/);
  assert.doesNotMatch(demo, /fetch\(|XMLHttpRequest|WebSocket/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
