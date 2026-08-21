import { describe, expect, it } from "vitest";

import { shouldUseLocalFakeModels } from "@/models/model-mode";

describe("model adapter selection", () => {
  it("uses deterministic models only for local development without a model credential", () => {
    expect(shouldUseLocalFakeModels({ NODE_ENV: "development" })).toBe(true);
    expect(shouldUseLocalFakeModels({ NODE_ENV: "development", OPENAI_API_KEY: "configured" })).toBe(false);
  });

  it("never falls back implicitly in production or tests", () => {
    expect(shouldUseLocalFakeModels({ NODE_ENV: "production" })).toBe(false);
    expect(shouldUseLocalFakeModels({ NODE_ENV: "test" })).toBe(false);
  });
});
