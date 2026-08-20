import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { auth } from "@clerk/nextjs/server";
import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/server";

import type { TenantContext } from "@/lib/auth/tenant-context";
import { isDemoMode } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { executeMcpTool, mcpToolScopes, type McpToolName } from "./tool-service";

const empty = z.object({}).strict();
const identifier = z.string().trim().min(1).max(200);
const objective = z.string().trim().min(10).max(2_000);
const constraints = z.array(z.string().trim().min(1).max(500)).max(20).optional();
const sessionId = z.uuid();
const revision = z.number().int().min(1).max(2_147_483_647);
const workerId = z.object({ workerId: identifier }).strict();
const approvalId = z.object({ approvalId: identifier, comment: z.string().max(500).optional() }).strict();
const startBuilderInput = z.union([
  z.object({ objective, constraints }).strict(),
  z.object({ workerId: identifier, constraints }).strict(),
]);
const definitions: Array<[McpToolName, string, z.ZodType]> = [
  ["start_worker_builder", "Start a persistent, reviewable worker design; optionally base it on an existing worker's latest immutable version", startBuilderInput],
  ["get_worker_builder", "Inspect a worker builder's current safe proposal and readiness", z.object({ sessionId }).strict()],
  ["refine_worker_builder", "Refine a worker proposal using its exact current revision", z.object({ sessionId, expectedRevision: revision, message: z.string().trim().min(1).max(500) }).strict()],
  ["commit_worker_builder", "Save the exact reviewed proposal as an immutable worker version without deploying it", z.object({ sessionId, expectedRevision: revision, expectedSpecHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()],
  ["abandon_worker_builder", "Close a worker builder without saving its proposal", z.object({ sessionId, expectedRevision: revision }).strict()],
  ["create_worker", "Compile and save a safe draft worker from an objective and explicit constraints", z.object({ objective, constraints }).strict()],
  ["get_worker", "Inspect one worker and its active WorkerSpec", workerId], ["list_workers", "List workers in the authenticated organization", empty],
  ["update_worker", "Compile and save a safe immutable version based on the worker's latest version", z.object({ workerId: identifier, objective, constraints }).strict()],
  ["list_connections", "List organization integration connection status", empty], ["connect_tool", "Start or inspect a secure integration connection", z.object({ provider: z.enum(["gmail", "hubspot", "slack"]) }).strict()],
  ["test_worker", "Run the actual worker path with all writes suppressed", workerId], ["deploy_worker", "Validate and deploy the latest worker version", workerId],
  ["trigger_worker", "Start an asynchronous manual live run", workerId], ["get_run", "Inspect one run timeline", z.object({ runId: identifier }).strict()],
  ["cancel_run", "Cancel an active run", z.object({ runId: identifier }).strict()], ["list_runs", "List runs, optionally for one worker", z.object({ workerId: identifier.optional() }).strict()], ["pause_worker", "Pause new worker runs", workerId], ["resume_worker", "Resume a paused worker", workerId],
  ["list_approvals", "List approval requests", empty], ["approve_action", "Approve the exact hashed action request", approvalId], ["reject_action", "Reject an action request", approvalId],
  ["get_usage", "Get organization or worker usage totals", z.object({ workerId: identifier.optional() }).strict()],
  ["list_worker_versions", "List immutable worker versions", workerId], ["rollback_worker", "Activate a historical WorkerSpec version", z.object({ workerId: identifier, versionId: identifier }).strict()], ["delete_worker", "Archive a worker", workerId],
];

const rateLimits: Partial<Record<McpToolName, number>> = {
  start_worker_builder: 20,
  get_worker_builder: 120,
  refine_worker_builder: 30,
  commit_worker_builder: 20,
  abandon_worker_builder: 20,
  create_worker: 20,
  update_worker: 20,
};

const builderBackedTools = new Set<McpToolName>([
  "start_worker_builder", "get_worker_builder", "refine_worker_builder", "commit_worker_builder", "abandon_worker_builder", "create_worker", "update_worker",
]);
const publicBuilderErrors = new Set([
  "BUILDER_SESSION_NOT_FOUND", "BUILDER_SESSION_CLOSED", "BUILDER_REVISION_CONFLICT", "BUILDER_MESSAGE_REQUIRED",
  "BUILDER_PROPOSAL_NOT_FOUND", "BUILDER_PROPOSAL_CHANGED", "BUILDER_PROPOSAL_HASH_MISMATCH",
  "WORKER_NOT_FOUND", "WORKER_VERSION_NOT_FOUND", "WORKER_ARCHIVED", "TENANT_ACCESS_DENIED", "RATE_LIMIT_EXCEEDED",
]);

function publicErrorCode(name: McpToolName, error: unknown): string {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (code.startsWith("MCP_SCOPE_REQUIRED:")) return code;
  if (!builderBackedTools.has(name)) return code;
  return publicBuilderErrors.has(code) ? code : "BUILDER_OPERATION_FAILED";
}

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
        await enforceRateLimit(tenant, `mcp:${name}`, rateLimits[name] ?? 120);
        const output = await executeMcpTool(name, input as Record<string, unknown>, tenant);
        return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
      }
      catch (error) { const code = publicErrorCode(name, error); return { isError: true, content: [{ type: "text", text: JSON.stringify({ code }) }] }; }
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
