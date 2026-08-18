import { protectedResourceHandlerClerk } from "@clerk/mcp-tools/next";
import { generateProtectedResourceMetadata } from "mcp-handler";

import { isDemoMode } from "@/lib/env";

const scopes = ["workers:read", "workers:write", "workers:deploy", "runs:read", "approvals:read", "approvals:write", "connections:read"];

export async function GET(request: Request) {
  if (!isDemoMode()) return protectedResourceHandlerClerk({ scopes_supported: scopes })(request);
  const origin = new URL(request.url).origin;
  return Response.json(generateProtectedResourceMetadata({ authServerUrls: [`${origin}/demo-oauth`], resourceUrl: `${origin}/api/mcp`, additionalMetadata: { scopes_supported: scopes } }));
}
