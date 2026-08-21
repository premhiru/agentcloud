import { describe, expect, it } from "vitest";

import { safeConnectionReturnTo } from "@/integrations/connection-return";

describe("connection return paths", () => {
  it("allows only scoped same-origin destinations", () => {
    expect(safeConnectionReturnTo("/workers/worker_1?tab=readiness#connections")).toBe("/workers/worker_1?tab=readiness#connections");
    expect(safeConnectionReturnTo("/connections?provider=gmail")).toBe("/connections?provider=gmail");
  });

  it.each(["https://evil.example", "//evil.example", "/dashboard", "/runs/1", "/workers\\evil", "/%2f%2fevil.example"])("rejects unsafe return destination %s", (value) => {
    expect(safeConnectionReturnTo(value)).toBe("/connections");
  });
});
