import { describe, expect, it } from "vitest";

import { isNavLinkActive } from "@/components/app-nav";

describe("application navigation", () => {
  it("matches a route and its nested operational detail routes", () => {
    expect(isNavLinkActive("/runs", { href: "/runs" })).toBe(true);
    expect(isNavLinkActive("/runs/run_123", { href: "/runs" })).toBe(true);
    expect(isNavLinkActive("/workers/worker_123", { href: "/workers" })).toBe(true);
    expect(isNavLinkActive("/dashboard", { href: "/runs" })).toBe(false);
  });

  it("treats the legacy integrations route as the Connections destination", () => {
    const connections = { href: "/connections", aliases: ["/integrations"] };
    expect(isNavLinkActive("/connections", connections)).toBe(true);
    expect(isNavLinkActive("/integrations", connections)).toBe(true);
  });

  it("does not match lookalike route prefixes", () => {
    expect(isNavLinkActive("/runs-archive", { href: "/runs" })).toBe(false);
  });
});
