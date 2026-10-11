import {
  calculateJwkThumbprint,
  CompactEncrypt,
  compactDecrypt,
  decodeProtectedHeader,
  importJWK,
  importPKCS8,
} from "jose";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import {
  decryptParameterValue,
  encryptParameterValue,
  generateParameterEncryptionKey,
  parameterPrivateKeySecretName,
  type EncryptedParameterValue,
  type ParameterEncryptionContext,
  type ParameterOrigin,
  type WorkspaceEncryptionConfiguration,
} from "./parameter-encryption.js";

const context: ParameterEncryptionContext = {
  repositoryId: "123456",
  batchId: "payment",
  parameterName: "Api_Token",
  origin: { type: "REQUEST_VALUE", requestId: "request-1" },
};

describe("parameter encryption", () => {
  let keys: Awaited<ReturnType<typeof generateParameterEncryptionKey>>;
  let otherKeys: Awaited<ReturnType<typeof generateParameterEncryptionKey>>;
  let consoleSpies: MockInstance[];

  beforeAll(async () => {
    keys = await generateParameterEncryptionKey();
    otherKeys = await generateParameterEncryptionKey();
  });

  beforeEach(() => {
    const methods = ["log", "info", "warn", "error", "debug"] as const;
    consoleSpies = methods.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
  });

  afterEach(() => {
    try {
      for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of consoleSpies) spy.mockRestore();
    }
  });

  it("exports RSA-2048 public configuration, its SHA-256 thumbprint and PKCS8", async () => {
    expect(parameterPrivateKeySecretName).toBe("BATCHPLANE_INPUT_KEY");
    expect(Object.keys(keys.configuration).sort()).toEqual([
      "keyId",
      "publicKey",
      "version",
    ]);
    expect(keys.configuration.version).toBe(1);
    expect(Object.keys(keys.configuration.publicKey).sort()).toEqual([
      "e",
      "kty",
      "n",
    ]);
    expect(keys.configuration.publicKey.kty).toBe("RSA");
    expect(
      await calculateJwkThumbprint(keys.configuration.publicKey, "sha256"),
    ).toBe(keys.configuration.keyId);
    expect(keys.privateKey.startsWith("-----BEGIN PRIVATE KEY-----")).toBe(
      true,
    );
    const privateKey = await importPKCS8(keys.privateKey, "RSA-OAEP-256");
    expect((privateKey.algorithm as RsaHashedKeyAlgorithm).modulusLength).toBe(
      2048,
    );
  });

  it("roundtrips exact strings and all origins without changing their source", async () => {
    const values = [
      "",
      "  \t ",
      " 00123 ",
      "\uD55C\uAE00 e\u0301 \u00E9 \uD83D\uDD10",
      "\nfirst\r\nsecond\nlast\n",
      "${{ secrets.NOT_AN_EXPRESSION }}",
    ];
    const origins: ParameterOrigin[] = [
      { type: "BATCH_DEFAULT" },
      { type: "SCHEDULE_VALUE", scheduleId: "nightly" },
      context.origin,
    ];
    for (const origin of origins) {
      const source = { ...context, origin };
      for (const value of values) {
        const encrypted = await encryptParameterValue(
          value,
          keys.configuration,
          source,
        );
        expect(Object.keys(encrypted).sort()).toEqual([
          "encrypted",
          "sensitive",
        ]);
        expect(Object.keys(encrypted.encrypted).sort()).toEqual([
          "jwe",
          "keyId",
          "version",
        ]);
        expect(encrypted.sensitive).toBe(true);
        expect(encrypted.encrypted.version).toBe(1);
        expect(encrypted.encrypted.keyId).toBe(keys.configuration.keyId);
        expect(encrypted.encrypted.jwe.split(".")).toHaveLength(5);
        expect(decodeProtectedHeader(encrypted.encrypted.jwe)).toEqual({
          alg: "RSA-OAEP-256",
          enc: "A256GCM",
          kid: keys.configuration.keyId,
        });
        const restored = await decryptParameterValue(
          encrypted,
          keys.privateKey,
          keys.configuration,
          source,
        );
        expect(restored === value).toBe(true);
      }
    }

    const first = await encryptParameterValue(
      "synthetic",
      keys.configuration,
      context,
    );
    const second = await encryptParameterValue(
      "synthetic",
      keys.configuration,
      context,
    );
    expect(first.encrypted.jwe === second.encrypted.jwe).toBe(false);
    const { plaintext } = await compactDecrypt(
      first.encrypted.jwe,
      await importPKCS8(keys.privateKey, "RSA-OAEP-256"),
    );
    expect(JSON.parse(new TextDecoder().decode(plaintext))).toEqual({
      value: "synthetic",
      context,
    });
  });

  it("rejects repository, batch, exact name and origin mismatches", async () => {
    const encrypted = await encryptParameterValue(
      "synthetic",
      keys.configuration,
      context,
    );
    const mismatches: ParameterEncryptionContext[] = [
      { ...context, repositoryId: "654321" },
      { ...context, batchId: "other-batch" },
      { ...context, parameterName: "API_TOKEN" },
      { ...context, origin: { type: "REQUEST_VALUE", requestId: "request-2" } },
      { ...context, origin: { type: "BATCH_DEFAULT" } },
      { ...context, origin: { type: "SCHEDULE_VALUE", scheduleId: "nightly" } },
    ];
    for (const expected of mismatches) {
      await expect(
        decryptParameterValue(
          encrypted,
          keys.privateKey,
          keys.configuration,
          expected,
        ),
      ).rejects.toThrow("PARAMETER_DECRYPTION_FAILED");
    }
    const scheduledContext: ParameterEncryptionContext = {
      ...context,
      origin: { type: "SCHEDULE_VALUE", scheduleId: "nightly" },
    };
    const scheduled = await encryptParameterValue(
      "synthetic",
      keys.configuration,
      scheduledContext,
    );
    await expect(
      decryptParameterValue(scheduled, keys.privateKey, keys.configuration, {
        ...context,
        origin: { type: "SCHEDULE_VALUE", scheduleId: "morning" },
      }),
    ).rejects.toThrow("PARAMETER_DECRYPTION_FAILED");
  });

  it("rejects changed ciphertext, wrong keys and relabelled key IDs", async () => {
    const encrypted = await encryptParameterValue(
      "synthetic",
      keys.configuration,
      context,
    );
    const parts = encrypted.encrypted.jwe.split(".");
    const ciphertext = parts[3]!;
    parts[3] = (ciphertext.startsWith("A") ? "B" : "A") + ciphertext.slice(1);
    const changed = {
      sensitive: true as const,
      encrypted: { ...encrypted.encrypted, jwe: parts.join(".") },
    };
    const relabelled = {
      sensitive: true as const,
      encrypted: {
        ...encrypted.encrypted,
        keyId: otherKeys.configuration.keyId,
      },
    };
    const failures = [
      () =>
        decryptParameterValue(
          changed,
          keys.privateKey,
          keys.configuration,
          context,
        ),
      () =>
        decryptParameterValue(
          encrypted,
          otherKeys.privateKey,
          keys.configuration,
          context,
        ),
      () =>
        decryptParameterValue(
          encrypted,
          keys.privateKey,
          otherKeys.configuration,
          context,
        ),
      () =>
        decryptParameterValue(
          relabelled,
          keys.privateKey,
          keys.configuration,
          context,
        ),
      () =>
        decryptParameterValue(
          relabelled,
          keys.privateKey,
          otherKeys.configuration,
          context,
        ),
      () =>
        decryptParameterValue(
          encrypted,
          "invalid PKCS8",
          keys.configuration,
          context,
        ),
    ];
    for (const failure of failures) {
      await expect(failure()).rejects.toThrow("PARAMETER_DECRYPTION_FAILED");
    }
  });

  it("refuses otherwise valid JWEs outside the explicit algorithm allowlist", async () => {
    for (const [alg, enc] of [
      ["RSA-OAEP", "A256GCM"],
      ["RSA-OAEP-256", "A128GCM"],
    ] as const) {
      const encrypted = await encryptPayload(
        new TextEncoder().encode(
          JSON.stringify({ value: "synthetic", context }),
        ),
        alg,
        enc,
      );
      const { plaintext } = await compactDecrypt(
        encrypted.encrypted.jwe,
        await importPKCS8(keys.privateKey, alg),
        {
          keyManagementAlgorithms: [alg],
          contentEncryptionAlgorithms: [enc],
        },
      );
      expect(
        JSON.parse(new TextDecoder().decode(plaintext)).value === "synthetic",
      ).toBe(true);
      await expect(
        decryptParameterValue(
          encrypted,
          keys.privateKey,
          keys.configuration,
          context,
        ),
      ).rejects.toThrow("PARAMETER_DECRYPTION_FAILED");
    }
  });

  it("validates input types, parameter names, origins and configuration at entry", async () => {
    for (const value of [null, undefined, 1, false, {}, "before\0after"]) {
      await expect(
        encryptParameterValue(value as string, keys.configuration, context),
      ).rejects.toThrow(
        typeof value === "string"
          ? "PARAMETER_NUL_UNSUPPORTED"
          : "PARAMETER_VALUE_INVALID",
      );
    }
    const invalidContexts = [
      null,
      { ...context, repositoryId: 123456 },
      { ...context, batchId: "" },
      { ...context, parameterName: null },
      { ...context, parameterName: "bad-name" },
      { ...context, parameterName: "1NAME" },
      { ...context, origin: { type: "OTHER" } },
      { ...context, origin: { type: "REQUEST_VALUE" } },
      { ...context, origin: { type: "SCHEDULE_VALUE", scheduleId: "" } },
    ];
    const encrypted = await encryptParameterValue(
      "synthetic",
      keys.configuration,
      context,
    );
    for (const invalid of invalidContexts) {
      await expect(
        encryptParameterValue(
          "synthetic",
          keys.configuration,
          invalid as ParameterEncryptionContext,
        ),
      ).rejects.toThrow();
      await expect(
        decryptParameterValue(
          encrypted,
          keys.privateKey,
          keys.configuration,
          invalid as ParameterEncryptionContext,
        ),
      ).rejects.toThrow();
    }
    for (const invalid of [
      null,
      { ...keys.configuration, version: 2 },
      { ...keys.configuration, keyId: "wrong" },
      { ...keys.configuration, publicKey: { kty: "EC", n: "n", e: "e" } },
    ]) {
      await expect(
        encryptParameterValue(
          "synthetic",
          invalid as WorkspaceEncryptionConfiguration,
          context,
        ),
      ).rejects.toThrow("PARAMETER_ENCRYPTION_CONFIGURATION_INVALID");
      await expect(
        decryptParameterValue(
          encrypted,
          keys.privateKey,
          invalid as WorkspaceEncryptionConfiguration,
          context,
        ),
      ).rejects.toThrow("PARAMETER_ENCRYPTION_CONFIGURATION_INVALID");
    }
    for (const invalid of [
      null,
      { sensitive: true, valueDigest: "legacy-hash-only" },
      { ...encrypted, sensitive: false },
      { sensitive: true, encrypted: { ...encrypted.encrypted, version: 2 } },
      { sensitive: true, encrypted: { ...encrypted.encrypted, jwe: "" } },
    ]) {
      await expect(
        decryptParameterValue(
          invalid as EncryptedParameterValue,
          keys.privateKey,
          keys.configuration,
          context,
        ),
      ).rejects.toThrow("PARAMETER_ENCRYPTED_VALUE_INVALID");
    }
  });

  it("revalidates decrypted payloads and hides parser errors without logging", async () => {
    const secret = "synthetic-private-input";
    const invalidPayloads = [
      new TextEncoder().encode(`{"value":"${secret}"`),
      new Uint8Array([0xff]),
      ...[
        null,
        { context },
        { value: 1, context },
        { value: `${secret}\0`, context },
        { value: secret, context: { ...context, parameterName: "bad-name" } },
        { value: secret, context: { ...context, origin: { type: "OTHER" } } },
      ].map((payload) => new TextEncoder().encode(JSON.stringify(payload))),
    ];
    for (const payload of invalidPayloads) {
      const encrypted = await encryptPayload(payload);
      const error = await decryptParameterValue(
        encrypted,
        keys.privateKey,
        keys.configuration,
        context,
      ).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("PARAMETER_DECRYPTION_FAILED");
      expect((error as Error).cause).toBeUndefined();
    }
  });

  async function encryptPayload(
    payload: Uint8Array,
    alg = "RSA-OAEP-256",
    enc = "A256GCM",
  ): Promise<EncryptedParameterValue> {
    const publicKey = await importJWK(keys.configuration.publicKey, alg);
    const jwe = await new CompactEncrypt(payload)
      .setProtectedHeader({ alg, enc, kid: keys.configuration.keyId })
      .encrypt(publicKey);
    return {
      sensitive: true,
      encrypted: { version: 1, keyId: keys.configuration.keyId, jwe },
    };
  }
});
