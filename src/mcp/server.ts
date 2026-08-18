import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { auth } from "@clerk/nextjs/server";
import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/server";

import type { TenantContext } from "@/lib/auth/tenant-context";
import { isDemoMode } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { executeMcpTool, mcpToolScopes, type McpToolName } from "./tool-service";

const empty = z.object({}).strict(); const workerId = z.object({ workerId: z.string().min(1) }).strict(); const approvalId = z.object({ approvalId: z.string().min(1), comment: z.string().max(500).optional() }).strict();
const definitions: Array<[McpToolName, string, z.ZodType]> = [
  ["create_worker", "Compile a safe draft worker from an objective", z.object({ objective: z.string().min(10).max(2000), constraints: z.array(z.string()).optional() }).strict()],
  ["get_worker", "Inspect one worker and its active WorkerSpec", workerId], ["list_workers", "List workers in the authenticated organization", empty],
  ["update_worker", "Create a new immutable worker version", z.object({ workerId: z.string(), objective: z.string().min(10) }).strict()],
  ["list_connections", "List organization integration connection status", empty], ["connect_tool", "Start or inspect a secure integration connection", z.object({ provider: z.enum(["gmail", "hubspot", "slack"]) }).strict()],
  ["test_worker", "Run the actual worker path with all writes suppressed", workerId], ["deploy_worker", "Validate and deploy the latest worker version", workerId],
  ["trigger_worker", "Start an asynchronous manual live run", workerId], ["get_run", "Inspect one run timeline", z.object({ runId: z.string() }).strict()],
  ["cancel_run", "Cancel an active run", z.object({ runId: z.string() }).strict()], ["list_runs", "List runs, optionally for one worker", z.object({ workerId: z.string().optional() }).strict()], ["pause_worker", "Pause new worker runs", workerId], ["resume_worker", "Resume a paused worker", workerId],
  ["list_approvals", "List approval requests", empty], ["approve_action", "Approve the exact hashed action request", approvalId], ["reject_action", "Reject an action request", approvalId],
  ["get_usage", "Get organization or worker usage totals", z.object({ workerId: z.string().optional() }).strict()],
  ["list_worker_versions", "List immutable worker versions", workerId], ["rollback_worker", "Activate a historical WorkerSpec version", z.object({ workerId: z.string(), versionId: z.string() }).strict()], ["delete_worker", "Archive a worker", workerId],
];

function tenantFromAuth(info: AuthInfo | undefined): TenantContext {
  const extra = info?.extra as { userId?: string; organizationId?: string; role?: "owner" | "member" } | undefined;
  if (!info || !extra?.userId || !extra.organizationId || !extra.role) throw new Error("TENANT_ACCESS_DENIED");
  return { organizationExternalId: extra.organizationId, userExternalId: extra.userId, role: extra.role, source: "mcp" };
}

export const rawMcpHandler = createMcpHandler((server) => {
  for (const [name, description, inputSchema] of definitions) {
    server.registerTool(name, { description, inputSchema }, async (input, ctx) => {
      try {
        const info = ctx.http?.authInfo;
        if (!info?.scopes.includes(mcpToolScopes[name])) throw new Error(`MCP_SCOPE_REQUIRED:${mcpToolScopes[name]}`);
        const tenant = tenantFromAuth(info);
        await enforceRateLimit(tenant, `mcp:${name}`, 120);
        const output = await executeMcpTool(name, input as Record<string, unknown>, tenant);
        return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
      }
      catch (error) { const code = error instanceof Error ? error.message : "INTERNAL_ERROR"; return { isError: true, content: [{ type: "text", text: JSON.stringify({ code }) }] }; }
    });
  }
}, { serverInfo: { name: "AgentCloud", version: "0.1.0" }, capabilities: { tools: { listChanged: false } } });

export async function verifyMcpToken(_request: Request, token?: string): Promise<AuthInfo | undefined> {
  if (isDemoMode()) {
    const scopes = token === "agentcloud-demo-token"
      ? ["workers:read", "workers:write", "workers:deploy", "runs:read", "approvals:read", "approvals:write", "connections:read"]
      : token === "agentcloud-demo-read-token" ? ["workers:read", "runs:read", "approvals:read", "connections:read"] : undefined;
    return scopes ? { token: token!, clientId: "demo-client", scopes, extra: { userId: "user_demo", organizationId: "org_demo", role: "owner" } } : undefined;
  }
  const clerkAuth = await auth({ acceptsToken: "oauth_token" }); const verified = verifyClerkToken(clerkAuth, token); if (!verified) return undefined;
  if (!clerkAuth.userId) return undefined;
  const { resolveMcpMembership } = await import("./tenant-resolver");
  const membership = await resolveMcpMembership(clerkAuth.userId); if (!membership) return undefined;
  return { ...verified, extra: { ...verified.extra, organizationId: membership.organizationExternalId, role: membership.role } };
}

export const mcpHandler = withMcpAuth(rawMcpHandler, verifyMcpToken, { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource" });
