import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { Client, StreamableHTTPClientTransport, UnauthorizedError } from "@modelcontextprotocol/client";
import { beforeAll, describe, expect, it } from "vitest";

type McpModules = typeof import("@/mcp/server");

let server: McpModules;

beforeAll(async () => {
  process.env.DEMO_MODE = "true";
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
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toBeTypeOf("object");
  return result.structuredContent as Record<string, unknown>;
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
    expect(denied.isError).toBe(true);
    expect(JSON.stringify(denied.content)).toContain("MCP_SCOPE_REQUIRED:workers:write");
    await client.close();
  });

  it("runs the required lifecycle and persists after the initiating client disconnects", async () => {
    const { client, transport } = makeClient("agentcloud-demo-token");
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "create_worker", "get_worker", "test_worker", "deploy_worker", "trigger_worker", "get_run",
      "approve_action", "pause_worker", "resume_worker", "rollback_worker", "cancel_run", "get_usage",
    ]));

    const created = output(await client.callTool({ name: "create_worker", arguments: { objective: "Qualify inbound sales enquiries and follow up safely" } }));
    const workerId = String(created.workerId);
    expect(workerId).not.toBe("");
    expect(output(await client.callTool({ name: "get_worker", arguments: { workerId } })).worker).toBeTruthy();

    const updated = output(await client.callTool({ name: "update_worker", arguments: { workerId, objective: "Qualify inbound sales enquiries, update CRM, and follow up safely" } }));
    expect((updated.worker as { versions: unknown[] }).versions).toHaveLength(2);
    const versions = output(await client.callTool({ name: "list_worker_versions", arguments: { workerId } })).versions as Array<{ id: string }>;

    const dryRun = output(await client.callTool({ name: "test_worker", arguments: { workerId } }));
    expect(dryRun.mode).toBe("dry_run");
    output(await client.callTool({ name: "deploy_worker", arguments: { workerId } }));

    const triggered = output(await client.callTool({ name: "trigger_worker", arguments: { workerId } }));
    expect(triggered.status).toBe("WAITING_FOR_APPROVAL");
    const runId = String(triggered.runId);
    const waitingRun = output(await client.callTool({ name: "get_run", arguments: { runId } })).run as { status: string };
    expect(waitingRun.status).toBe("WAITING_FOR_APPROVAL");

    const approvals = output(await client.callTool({ name: "list_approvals", arguments: {} })).approvals as Array<{ id: string; runId: string; status: string }>;
    const approval = approvals.find((item) => item.runId === runId);
    expect(approval?.status).toBe("PENDING");
    output(await client.callTool({ name: "approve_action", arguments: { approvalId: approval!.id, comment: "Approved by MCP test" } }));

    const completedRun = output(await client.callTool({ name: "get_run", arguments: { runId } })).run as { status: string; steps: Array<{ summary: string }> };
    expect(completedRun.status).toBe("SUCCEEDED");
    expect(completedRun.steps.filter((step) => step.summary === "Sent one approved Gmail response")).toHaveLength(1);

    output(await client.callTool({ name: "pause_worker", arguments: { workerId } }));
    output(await client.callTool({ name: "resume_worker", arguments: { workerId } }));
    const rolledBack = output(await client.callTool({ name: "rollback_worker", arguments: { workerId, versionId: versions[0]!.id } }));
    expect((rolledBack.worker as { activeVersionId: string }).activeVersionId).toBe(versions[0]!.id);
    await client.close();

    const { client: laterClient, transport: laterTransport } = makeClient("agentcloud-demo-token");
    await laterClient.connect(laterTransport);
    const persisted = output(await laterClient.callTool({ name: "get_worker", arguments: { workerId } })).worker as { id: string };
    expect(persisted.id).toBe(workerId);
    expect(output(await laterClient.callTool({ name: "get_run", arguments: { runId } })).run).toBeTruthy();
    await laterClient.close();
  });
});
