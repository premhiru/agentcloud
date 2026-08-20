type ResourceKind = "builder" | "worker" | "run" | "approval";

export type McpResourceLocation = Readonly<{
  path: string;
  url?: string;
}>;

function pathFor(kind: ResourceKind, id: string): string {
  const safeId = encodeURIComponent(id);
  switch (kind) {
    case "builder": return `/workers/build/${safeId}`;
    case "worker": return `/workers/${safeId}`;
    case "run": return `/runs/${safeId}`;
    case "approval": return "/approvals";
  }
}

function validApplicationOrigin(): string | undefined {
  const configured = process.env.APP_BASE_URL;
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !localHttp) return undefined;
    if (url.username || url.password) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function mcpResourceLocation(kind: ResourceKind, id: string): McpResourceLocation {
  const path = pathFor(kind, id);
  const origin = validApplicationOrigin();
  return { path, ...(origin ? { url: new URL(path, `${origin}/`).href } : {}) };
}
