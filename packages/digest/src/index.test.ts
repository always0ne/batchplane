import { describe, expect, it } from "vitest";

import {
  canonicalExecutionRequestDigestFixture,
  canonicalExecutionRequestPayloadFixture,
  canonicalize,
  canonicalizeExact,
  createCanonicalDigest,
  createExactCanonicalDigest,
  createParameterDigest,
  createReasonDigest,
  createRequestDigest,
  sha256BytesHex,
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

  it("signs literal strings and own property names without legacy normalization", async () => {
    const input = JSON.parse(
      '{"__proto__":{"value":"first"},"empty":"","none":null,"line":"a\\r\\nb"}',
    );
    expect(canonicalizeExact(input)).toBe(
      '{"__proto__":{"value":"first"},"empty":"","line":"a\\r\\nb","none":null}',
    );
    const digest = await createExactCanonicalDigest(input);
    const changes = [
      { ...input, line: "a\nb" },
      { ...input, ["__proto__"]: { value: "second" } },
      { ...input, empty: undefined },
    ];
    for (const changed of changes) {
      expect(await createExactCanonicalDigest(changed)).not.toBe(digest);
    }
  });

  it("creates SHA-256 digests", async () => {
    await expect(sha256Hex("hello")).resolves.toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("hashes the exact supplied bytes", async () => {
    const textBytes = new TextEncoder().encode("artifact\n");
    const changedBytes = new TextEncoder().encode("artifact\r\n");

    await expect(sha256BytesHex(textBytes)).resolves.toBe(
      "5b3513f580c8397212ff2c8f459c199efc0c90e4354a5f3533adf0a3fff3a530",
    );
    await expect(sha256BytesHex(changedBytes)).resolves.not.toBe(
      "5b3513f580c8397212ff2c8f459c199efc0c90e4354a5f3533adf0a3fff3a530",
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
        labels: ["batchplane:execution-request", "priority:p0"],
        markdownBody: "## BatchPlane Execution Request",
        payload: canonicalExecutionRequestPayloadFixture,
      }),
    ).resolves.toBe(canonicalExecutionRequestDigestFixture);
  });

  it("changes the digest when canonical payload fields are mutated", async () => {
    const mutatedPayload = {
      ...canonicalExecutionRequestPayloadFixture,
      spec: {
        ...(
          canonicalExecutionRequestPayloadFixture as {
            spec: Record<string, unknown>;
          }
        ).spec,
        requestedBy: "ops-approver",
      },
    };

    const originalDigest = await createRequestDigest(
      canonicalExecutionRequestPayloadFixture,
    );
    const mutatedDigest = await createRequestDigest(mutatedPayload);

    expect(mutatedDigest).not.toBe(originalDigest);
  });
});
