import { describe, expect, it } from "vitest";

import {
  canonicalExecutionRequestDigestFixture,
  canonicalExecutionRequestPayloadFixture,
  canonicalize,
  createCanonicalDigest,
  createParameterDigest,
  createReasonDigest,
  createRequestDigest,
  sha256Hex,
} from "./index";

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

  it("creates SHA-256 digests", async () => {
    await expect(sha256Hex("hello")).resolves.toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("creates prefixed canonical digests", async () => {
    await expect(
      createCanonicalDigest({ b: "2", a: { d: "4", c: "3" } }),
    ).resolves.toBe(
      "sha256:db7e158e65a1392236c7495a5d21cb1d25d74f4c5d3b29ba95f825a608cf765c",
    );
  });

  it("normalizes newlines before digesting", () => {
    expect(canonicalize({ reason: "line1\r\nline2\rline3" })).toBe(
      '{"reason":"line1\\nline2\\nline3"}',
    );
  });

  it("creates typed parameter, reason, and request digests", async () => {
    await expect(
      createParameterDigest({ b: "2", a: { d: "4", c: "3" } }),
    ).resolves.toMatch(/^sha256:[a-f0-9]{64}$/);
    await expect(createReasonDigest("Manual approval")).resolves.toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    await expect(
      createRequestDigest(canonicalExecutionRequestPayloadFixture),
    ).resolves.toBe(canonicalExecutionRequestDigestFixture);
  });

  it("digests request payloads without markdown wrappers, labels, or comments", async () => {
    await expect(
      createRequestDigest({
        comments: ["looks good", "approved"],
        labels: ["batchtrail:execution-request", "priority:p0"],
        markdownBody: "## BatchTrail Execution Request",
        payload: canonicalExecutionRequestPayloadFixture,
      }),
    ).resolves.toBe(canonicalExecutionRequestDigestFixture);
  });
});
