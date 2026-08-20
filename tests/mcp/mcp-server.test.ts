import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { Client, StreamableHTTPClientTransport, UnauthorizedError } from "@modelcontextprotocol/client";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type McpModules = typeof import("@/mcp/server");

let server: McpModules;

beforeAll(async () => {
  process.env.DEMO_MODE = "true";
  process.env.APP_BASE_URL = "http://127.0.0.1:3000";
  process.env.AGENTCLOUD_DEMO_DATA_PATH = resolve(process.cwd(), ".agentcloud", `mcp-test-${randomUUID()}.json`);
  server = await import("@/mcp/server");
});

function makeClient(token: string) {
  const transport = new StreamableHTTPClientTransport(new URL("http://agentcloud.test/api/mcp"), {
    authProvider: { token: async () => token },
    fetch: async (input, init) => server.mcpHandler(new Request(input, init)),
  });
  const client = new Client({ name: "agentcloud-test", version: "1.0.0" });
  return { client, transport };
}

function output(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, unknown> {
  expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
  expect(result.structuredContent).toBeTypeOf("object");
  return result.structuredContent as Record<string, unknown>;
}

function expectToolError(result: Awaited<ReturnType<Client["callTool"]>>, code: string): void {
  expect(result.isError).toBe(true);
  expect(JSON.stringify(result.content)).toContain(code);
}

type BuilderProposal = { specHash: string; spec: { objective: string } };
type BuilderSession = {
  id: string;
  revision: number;
  status: string;
  workerId?: string;
  proposalHistory: Array<{ revision: number; specHash: string }>;
};

function builderState(value: Record<string, unknown>): { session: BuilderSession; latestProposal: BuilderProposal } {
  const session = value.session as BuilderSession;
  const latestProposal = value.latestProposal as BuilderProposal;
  expect(session).toBeTruthy();
  expect(latestProposal).toBeTruthy();
  expect(latestProposal.specHash).toMatch(/^[a-f0-9]{64}$/);
  expect(session.proposalHistory.at(-1)?.specHash).toBe(latestProposal.specHash);
  expect(session).not.toHaveProperty("organizationId");
  expect(session).not.toHaveProperty("createdBy");
  expect(session).not.toHaveProperty("messages");
  expect(JSON.stringify(session)).not.toContain("[AgentCloud builder constraints]");
  return { session, latestProposal };
}

function expectStableLocation(
  value: Record<string, unknown>,
  name: "builder" | "worker" | "run" | "approvals",
  path: string,
): void {
  expect(value[`${name}Path`]).toBe(path);
  expect(value[`${name}Url`]).toBe(`http://127.0.0.1:3000${path}`);
}

describe("authenticated AgentCloud MCP server", () => {
  it("rejects requests without a valid bearer token", async () => {
    const response = await server.mcpHandler(new Request("http://agentcloud.test/api/mcp", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);

    const { client, transport } = makeClient("invalid-token");
    await expect(client.connect(transport)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("enforces tool-level OAuth scopes", async () => {
    const { client, transport } = makeClient("agentcloud-demo-read-token");
    await client.connect(transport);
    expect((await client.listTools()).tools.length).toBeGreaterThan(0);
    const denied = await client.callTool({ name: "create_worker", arguments: { objective: "Qualify every inbound sales lead safely" } });
    expectToolError(denied, "MCP_SCOPE_REQUIRED:workers:write");
    expectToolError(await client.callTool({
      name: "start_worker_builder",
      arguments: { objective: "Qualify every inbound sales lead safely" },
    }), "MCP_SCOPE_REQUIRED:workers:write");
    expectToolError(await client.callTool({
      name: "refine_worker_builder",
      arguments: { sessionId: randomUUID(), expectedRevision: 1, message: "Attempt a mutation" },
    }), "MCP_SCOPE_REQUIRED:workers:write");
    await client.close();
  });

  it("builds, persists, commits, and operates a worker through stable MCP links", async () => {
    const { client, transport } = makeClient("agentcloud-demo-token");
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "start_worker_builder", "get_worker_builder", "refine_worker_builder", "commit_worker_builder", "abandon_worker_builder",
      "get_worker", "test_worker", "deploy_worker", "trigger_worker", "get_run",
      "approve_action", "pause_worker", "resume_worker", "rollback_worker", "cancel_run", "get_usage",
    ]));

    const started = output(await client.callTool({
      name: "start_worker_builder",
      arguments: {
        objective: "Qualify inbound sales enquiries, update CRM, and follow up safely",
        constraints: ["Require human approval before sending an external email", "api_key=supersecretvalue"],
      },
    }));
    const initial = builderState(started);
    expect(initial.session.revision).toBe(1);
    expect(initial.session.status).toBe("READY");
    expect(JSON.stringify(started)).not.toContain("supersecretvalue");
    expect(JSON.stringify(started)).not.toContain("[AgentCloud builder constraints]");
    expectStableLocation(started, "builder", `/workers/build/${initial.session.id}`);

    const fetched = output(await client.callTool({ name: "get_worker_builder", arguments: { sessionId: initial.session.id } }));
    expect(builderState(fetched).session.revision).toBe(1);

    const stale = await client.callTool({
      name: "refine_worker_builder",
      arguments: { sessionId: initial.session.id, expectedRevision: 8, message: "Cap follow-up emails at ten per day" },
    });
    expectToolError(stale, "BUILDER_REVISION_CONFLICT");

    const refined = output(await client.callTool({
      name: "refine_worker_builder",
      arguments: { sessionId: initial.session.id, expectedRevision: 1, message: "Cap follow-up emails at ten per day" },
    }));
    const refinement = builderState(refined);
    expect(refinement.session.revision).toBe(2);
    expect(refinement.session.proposalHistory).toHaveLength(2);
    expectStableLocation(refined, "builder", `/workers/build/${initial.session.id}`);

    const { client: readClient, transport: readTransport } = makeClient("agentcloud-demo-read-token");
    await readClient.connect(readTransport);
    const readOnlyView = output(await readClient.callTool({ name: "get_worker_builder", arguments: { sessionId: initial.session.id } }));
    expect(builderState(readOnlyView).session.revision).toBe(2);
    expectToolError(await readClient.callTool({
      name: "refine_worker_builder",
      arguments: { sessionId: initial.session.id, expectedRevision: 2, message: "A read token must not mutate this session" },
    }), "MCP_SCOPE_REQUIRED:workers:write");
    await readClient.close();

    await client.close();

    const { client: laterClient, transport: laterTransport } = makeClient("agentcloud-demo-token");
    await laterClient.connect(laterTransport);
    const persistedBuilder = output(await laterClient.callTool({ name: "get_worker_builder", arguments: { sessionId: initial.session.id } }));
    const persistedState = builderState(persistedBuilder);
    expect(persistedState.session.revision).toBe(2);
    expect(persistedState.latestProposal.specHash).toBe(refinement.latestProposal.specHash);

    expectToolError(await laterClient.callTool({
      name: "commit_worker_builder",
      arguments: {
        sessionId: initial.session.id,
        expectedRevision: persistedState.session.revision,
        expectedSpecHash: "0".repeat(64),
      },
    }), "BUILDER_PROPOSAL_CHANGED");

    const committed = output(await laterClient.callTool({
      name: "commit_worker_builder",
      arguments: {
        sessionId: initial.session.id,
        expectedRevision: persistedState.session.revision,
        expectedSpecHash: persistedState.latestProposal.specHash,
      },
    }));
    const workerId = String(committed.workerId);
    const firstVersionId = String(committed.workerVersionId);
    expect(workerId).not.toBe("");
    expect(firstVersionId).not.toBe("");
    expect(committed.versionNumber).toBe(1);
    expectStableLocation(committed, "worker", `/workers/${workerId}`);

    expectToolError(await laterClient.callTool({
      name: "commit_worker_builder",
      arguments: {
        sessionId: initial.session.id,
        expectedRevision: persistedState.session.revision,
        expectedSpecHash: persistedState.latestProposal.specHash,
      },
    }), "BUILDER_SESSION_CLOSED");

    const inspected = output(await laterClient.callTool({ name: "get_worker", arguments: { workerId } }));
    const createdWorker = inspected.worker as { id: string; status: string; versions: Array<{ id: string; specHash: string }> };
    expect(createdWorker.id).toBe(workerId);
    expect(createdWorker.status).toBe("READY");
    expect(createdWorker.versions).toHaveLength(1);
    expect(createdWorker.versions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: firstVersionId, specHash: persistedState.latestProposal.specHash }),
    ]));
    expectStableLocation(inspected, "worker", `/workers/${workerId}`);

    const dryRun = output(await laterClient.callTool({ name: "test_worker", arguments: { workerId } }));
    expect(dryRun.mode).toBe("dry_run");
    expect(dryRun.status).toBe("SUCCEEDED");
    expectStableLocation(dryRun, "run", `/runs/${String(dryRun.runId)}`);
    const deployed = output(await laterClient.callTool({ name: "deploy_worker", arguments: { workerId } }));
    expectStableLocation(deployed, "worker", `/workers/${workerId}`);

    const triggered = output(await laterClient.callTool({ name: "trigger_worker", arguments: { workerId } }));
    expect(triggered.status).toBe("WAITING_FOR_APPROVAL");
    const runId = String(triggered.runId);
    expectStableLocation(triggered, "run", `/runs/${runId}`);
    expectStableLocation(triggered, "approvals", "/approvals");
    const waitingRunOutput = output(await laterClient.callTool({ name: "get_run", arguments: { runId } }));
    const waitingRun = waitingRunOutput.run as { status: string };
    expect(waitingRun.status).toBe("WAITING_FOR_APPROVAL");
    expectStableLocation(waitingRunOutput, "run", `/runs/${runId}`);

    const approvalOutput = output(await laterClient.callTool({ name: "list_approvals", arguments: {} }));
    expectStableLocation(approvalOutput, "approvals", "/approvals");
    const approvals = approvalOutput.approvals as Array<{ id: string; runId: string; status: string }>;
    const approval = approvals.find((item) => item.runId === runId);
    expect(approval?.status).toBe("PENDING");
    const approved = output(await laterClient.callTool({ name: "approve_action", arguments: { approvalId: approval!.id, comment: "Approved by MCP test" } }));
    expectStableLocation(approved, "run", `/runs/${runId}`);

    const completedRun = output(await laterClient.callTool({ name: "get_run", arguments: { runId } })).run as { status: string; steps: Array<{ summary: string }> };
    expect(completedRun.status).toBe("SUCCEEDED");
    expect(completedRun.steps.filter((step) => step.summary === "Sent one approved Gmail response")).toHaveLength(1);

    expectStableLocation(output(await laterClient.callTool({ name: "pause_worker", arguments: { workerId } })), "worker", `/workers/${workerId}`);
    expectStableLocation(output(await laterClient.callTool({ name: "resume_worker", arguments: { workerId } })), "worker", `/workers/${workerId}`);

    const improvement = output(await laterClient.callTool({ name: "start_worker_builder", arguments: { workerId } }));
    const improvementState = builderState(improvement);
    expect(improvementState.session.workerId).toBe(workerId);
    const improved = output(await laterClient.callTool({
      name: "refine_worker_builder",
      arguments: { sessionId: improvementState.session.id, expectedRevision: 1, message: "Add a concise audit note to every qualified lead" },
    }));
    const improvedState = builderState(improved);
    const committedVersion = output(await laterClient.callTool({
      name: "commit_worker_builder",
      arguments: { sessionId: improvementState.session.id, expectedRevision: 2, expectedSpecHash: improvedState.latestProposal.specHash },
    }));
    expect(committedVersion.workerId).toBe(workerId);
    expect(committedVersion.versionNumber).toBe(2);
    expectStableLocation(committedVersion, "worker", `/workers/${workerId}`);

    const versionOutput = output(await laterClient.callTool({ name: "list_worker_versions", arguments: { workerId } }));
    const versions = versionOutput.versions as Array<{ id: string }>;
    expect(versions).toHaveLength(2);
    expectStableLocation(versionOutput, "worker", `/workers/${workerId}`);
    const rolledBack = output(await laterClient.callTool({ name: "rollback_worker", arguments: { workerId, versionId: firstVersionId } }));
    expect((rolledBack.worker as { activeVersionId: string }).activeVersionId).toBe(firstVersionId);
    expectStableLocation(rolledBack, "worker", `/workers/${workerId}`);

    expect(output(await laterClient.callTool({ name: "get_run", arguments: { runId } })).run).toBeTruthy();

    const disposable = output(await laterClient.callTool({
      name: "start_worker_builder",
      arguments: { objective: "Summarize internal operational handoffs safely" },
    }));
    const disposableState = builderState(disposable);
    const abandoned = output(await laterClient.callTool({
      name: "abandon_worker_builder",
      arguments: { sessionId: disposableState.session.id, expectedRevision: disposableState.session.revision },
    }));
    expect(builderState(abandoned).session.status).toBe("ABANDONED");
    expect(builderState(output(await laterClient.callTool({
      name: "get_worker_builder",
      arguments: { sessionId: disposableState.session.id },
    }))).session.status).toBe("ABANDONED");
    expectToolError(await laterClient.callTool({
      name: "refine_worker_builder",
      arguments: { sessionId: disposableState.session.id, expectedRevision: disposableState.session.revision, message: "This must remain closed" },
    }), "BUILDER_SESSION_CLOSED");
    await laterClient.close();
  });
});
