import { describe, expect, it } from "vitest";

import { canonicalize } from "./index";

describe("canonicalize", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalize({ b: "2", a: { d: "4", c: "3" } })).toBe(
      '{"a":{"c":"3","d":"4"},"b":"2"}',
    );
  });

  it("omits empty optional values", () => {
    expect(canonicalize({ a: "1", b: "", c: null, d: undefined })).toBe(
      '{"a":"1"}',
    );
  });
});
