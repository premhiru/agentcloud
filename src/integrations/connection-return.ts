export function safeConnectionReturnTo(value: string | undefined): string {
  if (!value) return "/connections";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("\0")) return "/connections";
  const url = new URL(value, "https://agentcloud.invalid");
  if (url.origin !== "https://agentcloud.invalid" || !/^\/(connections|workers(?:\/|$))/.test(url.pathname)) return "/connections";
  return `${url.pathname}${url.search}${url.hash}`;
}
