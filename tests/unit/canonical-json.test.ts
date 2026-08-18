import { describe, expect, it } from "vitest";

import { canonicalJson, hashActionRequest } from "@/domain/canonical-json";

describe("canonical hashing", () => {
  it("is independent of object key insertion order", () => {
    expect(hashActionRequest({ b: 2, a: { d: 4, c: 3 } })).toBe(hashActionRequest({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it("changes when the approved payload changes", () => {
    expect(hashActionRequest({ to: "a@example.com" })).not.toBe(hashActionRequest({ to: "b@example.com" }));
  });

  it("normalizes undefined object fields", () => {
    expect(canonicalJson({ a: 1, missing: undefined })).toBe('{"a":1}');
  });
});
