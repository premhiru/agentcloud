import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import { config } from "@/proxy";

describe("Clerk proxy coverage", () => {
  it("keeps Clerk's frontend API matcher after application API coverage", () => {
    expect(config.matcher).toEqual([
      "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
      "/(api|trpc)(.*)",
      "/__clerk/:path*",
    ]);
  });

  it.each(["/dashboard", "/api/workers", "/__clerk/v1/client"])("matches %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
  });

  it("does not run for static assets", () => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/logo.svg" })).toBe(false);
  });
});
