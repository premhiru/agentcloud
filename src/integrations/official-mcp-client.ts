import { Client, StreamableHTTPClientTransport, UnauthorizedError, type OAuthClientMetadata, type OAuthClientProvider, type OAuthDiscoveryState, type StoredOAuthClientInformation, type StoredOAuthTokens } from "@modelcontextprotocol/client";

import type { IntegrationProvider } from "@/domain/tool-registry";
import { officialMcpServers } from "./remote-mcp-adapter";

export type OfficialMcpOAuthState = {
  tokens?: StoredOAuthTokens;
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
  authorizationServerUrl?: string;
  resourceUrl?: string;
};

export type OfficialMcpClientConfiguration = Readonly<{ clientId: string; clientSecret: string; encryptionKey: string; endpoint: string }>;

export function getOfficialMcpConfiguration(provider: IntegrationProvider): Readonly<{ configured: boolean; missing: readonly string[]; configuration?: OfficialMcpClientConfiguration }> {
  const clientIdKey = `MCP_${provider.toUpperCase()}_CLIENT_ID`;
  const clientSecretKey = `MCP_${provider.toUpperCase()}_CLIENT_SECRET`;
  const encryptionKey = process.env.MCP_CONNECTION_ENCRYPTION_KEY;
  const encryptionKeyValid = Boolean(encryptionKey && Buffer.from(encryptionKey, "base64").length === 32);
  const missing = [
    ...(!encryptionKeyValid ? ["MCP_CONNECTION_ENCRYPTION_KEY (base64-encoded 32 bytes)"] : []),
    ...(!process.env[clientIdKey] ? [clientIdKey] : []),
    ...(!process.env[clientSecretKey] ? [clientSecretKey] : []),
  ];
  return missing.length ? { configured: false, missing } : { configured: true, missing, configuration: { clientId: process.env[clientIdKey]!, clientSecret: process.env[clientSecretKey]!, encryptionKey: encryptionKey!, endpoint: officialMcpServers[provider] } };
}

class DurableOAuthProvider implements OAuthClientProvider {
  authorizationUrl?: string;
  constructor(
    private readonly configuration: OfficialMcpClientConfiguration,
    private readonly callbackUrl: string,
    private readonly csrfState: string,
    private oauthState: OfficialMcpOAuthState,
    private readonly persist: (state: OfficialMcpOAuthState) => Promise<void>,
  ) {}

  get redirectUrl() { return this.callbackUrl; }
  get clientMetadata(): OAuthClientMetadata {
    return { client_name: "AgentCloud", redirect_uris: [this.callbackUrl], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "client_secret_post" };
  }
  state() { return this.csrfState; }
  clientInformation(): StoredOAuthClientInformation { return { client_id: this.configuration.clientId, client_secret: this.configuration.clientSecret, token_endpoint_auth_method: "client_secret_post" }; }
  tokens() { return this.oauthState.tokens; }
  async saveTokens(tokens: StoredOAuthTokens) { this.oauthState = { ...this.oauthState, tokens }; await this.persist(this.oauthState); }
  redirectToAuthorization(url: URL) { this.authorizationUrl = url.toString(); }
  async saveCodeVerifier(codeVerifier: string) { this.oauthState = { ...this.oauthState, codeVerifier }; await this.persist(this.oauthState); }
  codeVerifier() { if (!this.oauthState.codeVerifier) throw new Error("MCP_CODE_VERIFIER_MISSING"); return this.oauthState.codeVerifier; }
  async saveDiscoveryState(discoveryState: OAuthDiscoveryState) { this.oauthState = { ...this.oauthState, discoveryState }; await this.persist(this.oauthState); }
  discoveryState() { return this.oauthState.discoveryState; }
  async saveAuthorizationServerUrl(authorizationServerUrl: string) { this.oauthState = { ...this.oauthState, authorizationServerUrl }; await this.persist(this.oauthState); }
  authorizationServerUrl() { return this.oauthState.authorizationServerUrl; }
  async saveResourceUrl(resourceUrl: string) { this.oauthState = { ...this.oauthState, resourceUrl }; await this.persist(this.oauthState); }
  resourceUrl() { return this.oauthState.resourceUrl; }
  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all") this.oauthState = {};
    else if (scope === "tokens") delete this.oauthState.tokens;
    else if (scope === "verifier") delete this.oauthState.codeVerifier;
    else if (scope === "discovery") delete this.oauthState.discoveryState;
    await this.persist(this.oauthState);
  }
}

function session(input: Readonly<{ provider: IntegrationProvider; callbackUrl: string; csrfState: string; oauthState: OfficialMcpOAuthState; configuration: OfficialMcpClientConfiguration; persist: (state: OfficialMcpOAuthState) => Promise<void> }>) {
  const authProvider = new DurableOAuthProvider(input.configuration, input.callbackUrl, input.csrfState, input.oauthState, input.persist);
  const transport = new StreamableHTTPClientTransport(new URL(input.configuration.endpoint), { authProvider, onInsufficientScope: "throw" });
  const client = new Client({ name: "AgentCloud", version: "0.1.0" }, { versionNegotiation: { mode: "auto" } });
  return { authProvider, transport, client };
}

export async function beginOfficialMcpAuthorization(input: Readonly<{ provider: IntegrationProvider; callbackUrl: string; csrfState: string; oauthState: OfficialMcpOAuthState; configuration: OfficialMcpClientConfiguration; persist: (state: OfficialMcpOAuthState) => Promise<void> }>): Promise<string> {
  const active = session(input);
  try { await active.client.connect(active.transport); }
  catch (error) { if (!(error instanceof UnauthorizedError) && !UnauthorizedError.isInstance(error)) throw error; }
  finally { await active.client.close().catch(() => undefined); }
  if (!active.authProvider.authorizationUrl) throw new Error("MCP_AUTHORIZATION_URL_MISSING");
  return active.authProvider.authorizationUrl;
}

export async function completeOfficialMcpAuthorization(input: Readonly<{ provider: IntegrationProvider; callbackUrl: string; csrfState: string; callbackParams: URLSearchParams; oauthState: OfficialMcpOAuthState; configuration: OfficialMcpClientConfiguration; persist: (state: OfficialMcpOAuthState) => Promise<void> }>): Promise<readonly string[]> {
  const active = session(input);
  await active.transport.finishAuth(input.callbackParams);
  await active.client.connect(active.transport);
  try { return (await active.client.listTools()).tools.map((tool) => tool.name); }
  finally { await active.client.close().catch(() => undefined); }
}

export async function callOfficialMcpTool(input: Readonly<{ provider: IntegrationProvider; callbackUrl: string; csrfState: string; oauthState: OfficialMcpOAuthState; configuration: OfficialMcpClientConfiguration; persist: (state: OfficialMcpOAuthState) => Promise<void>; toolName: string; arguments: Record<string, unknown> }>): Promise<Record<string, unknown>> {
  const active = session(input);
  await active.client.connect(active.transport);
  try {
    const result = await active.client.callTool({ name: input.toolName, arguments: input.arguments });
    if (result.isError) throw new Error("REMOTE_MCP_TOOL_REJECTED");
    return { content: result.content, structuredContent: result.structuredContent };
  } finally { await active.client.close().catch(() => undefined); }
}
