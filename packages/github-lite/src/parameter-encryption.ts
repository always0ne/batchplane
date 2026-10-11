import {
  validateParameterNames,
  validateParameterString,
} from "@batchplane/domain";
import {
  calculateJwkThumbprint,
  CompactEncrypt,
  compactDecrypt,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  importJWK,
  importPKCS8,
} from "jose";

export type ParameterOrigin =
  | { type: "BATCH_DEFAULT" }
  | { type: "SCHEDULE_VALUE"; scheduleId: string }
  | { type: "REQUEST_VALUE"; requestId: string };

export type ParameterEncryptionContext = {
  repositoryId: string;
  batchId: string;
  parameterName: string;
  origin: ParameterOrigin;
};

export type WorkspaceEncryptionConfiguration = {
  version: 1;
  keyId: string;
  publicKey: { kty: string; n: string; e: string };
};

export type EncryptedParameterValue = {
  sensitive: true;
  encrypted: { version: 1; keyId: string; jwe: string };
};

export const parameterPrivateKeySecretName = "BATCHPLANE_INPUT_KEY";

const keyAlgorithm = "RSA-OAEP-256";
const contentAlgorithm = "A256GCM";

export async function generateParameterEncryptionKey(): Promise<{
  configuration: WorkspaceEncryptionConfiguration;
  privateKey: string;
}> {
  try {
    // jose defaults to RSA-2048; private export is only needed during setup.
    const { publicKey, privateKey } = await generateKeyPair(keyAlgorithm, {
      extractable: true,
    });
    const jwk = await exportJWK(publicKey);
    if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) {
      throw new Error("PARAMETER_KEY_GENERATION_FAILED");
    }
    const publicJwk = { kty: jwk.kty, n: jwk.n, e: jwk.e };
    return {
      configuration: {
        version: 1,
        keyId: await calculateJwkThumbprint(publicJwk, "sha256"),
        publicKey: publicJwk,
      },
      privateKey: await exportPKCS8(privateKey),
    };
  } catch {
    throw new Error("PARAMETER_KEY_GENERATION_FAILED");
  }
}

export async function encryptParameterValue(
  value: string,
  configuration: WorkspaceEncryptionConfiguration,
  context: ParameterEncryptionContext,
): Promise<EncryptedParameterValue> {
  validateParameterString(value);
  const validatedContext = readParameterContext(context);
  const validatedConfiguration =
    await readEncryptionConfiguration(configuration);
  try {
    const publicKey = await importJWK(
      validatedConfiguration.publicKey,
      keyAlgorithm,
    );
    const jwe = await new CompactEncrypt(
      new TextEncoder().encode(
        JSON.stringify({ value, context: validatedContext }),
      ),
    )
      .setProtectedHeader({
        alg: keyAlgorithm,
        enc: contentAlgorithm,
        kid: validatedConfiguration.keyId,
      })
      .encrypt(publicKey);
    return {
      sensitive: true,
      encrypted: { version: 1, keyId: validatedConfiguration.keyId, jwe },
    };
  } catch {
    throw new Error("PARAMETER_ENCRYPTION_FAILED");
  }
}

export async function decryptParameterValue(
  encrypted: EncryptedParameterValue,
  privateKey: string,
  configuration: WorkspaceEncryptionConfiguration,
  expectedContext: ParameterEncryptionContext,
): Promise<string> {
  const envelope = readEncryptedParameterValue(encrypted);
  const validatedContext = readParameterContext(expectedContext);
  const validatedConfiguration =
    await readEncryptionConfiguration(configuration);
  try {
    if (
      envelope.keyId !== validatedConfiguration.keyId ||
      typeof privateKey !== "string"
    ) {
      throw new Error("PARAMETER_DECRYPTION_FAILED");
    }
    const key = await importPKCS8(privateKey, keyAlgorithm);
    const { plaintext, protectedHeader } = await compactDecrypt(
      envelope.jwe,
      key,
      {
        keyManagementAlgorithms: [keyAlgorithm],
        contentEncryptionAlgorithms: [contentAlgorithm],
      },
    );
    if (protectedHeader.kid !== validatedConfiguration.keyId) {
      throw new Error("PARAMETER_DECRYPTION_FAILED");
    }
    const payload: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
    );
    if (!isRecord(payload)) throw new Error("PARAMETER_DECRYPTION_FAILED");
    validateParameterString(payload.value);
    const actualContext = readParameterContext(payload.context);
    if (!contextsMatch(actualContext, validatedContext)) {
      throw new Error("PARAMETER_DECRYPTION_FAILED");
    }
    return payload.value;
  } catch {
    // Parser/library errors can include input snippets; never expose their cause.
    throw new Error("PARAMETER_DECRYPTION_FAILED");
  }
}

async function readEncryptionConfiguration(
  value: unknown,
): Promise<WorkspaceEncryptionConfiguration> {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isIdentifier(value.keyId) ||
    !isRecord(value.publicKey) ||
    value.publicKey.kty !== "RSA" ||
    !isIdentifier(value.publicKey.n) ||
    !isIdentifier(value.publicKey.e)
  ) {
    throw new Error("PARAMETER_ENCRYPTION_CONFIGURATION_INVALID");
  }
  const configuration: WorkspaceEncryptionConfiguration = {
    version: 1,
    keyId: value.keyId,
    publicKey: { kty: "RSA", n: value.publicKey.n, e: value.publicKey.e },
  };
  try {
    const keyId = await calculateJwkThumbprint(
      configuration.publicKey,
      "sha256",
    );
    if (keyId !== configuration.keyId) {
      throw new Error("PARAMETER_ENCRYPTION_CONFIGURATION_INVALID");
    }
  } catch {
    throw new Error("PARAMETER_ENCRYPTION_CONFIGURATION_INVALID");
  }
  return configuration;
}

function readEncryptedParameterValue(
  value: unknown,
): EncryptedParameterValue["encrypted"] {
  if (
    !isRecord(value) ||
    value.sensitive !== true ||
    !isRecord(value.encrypted) ||
    value.encrypted.version !== 1 ||
    !isIdentifier(value.encrypted.keyId) ||
    !isIdentifier(value.encrypted.jwe)
  ) {
    throw new Error("PARAMETER_ENCRYPTED_VALUE_INVALID");
  }
  return {
    version: 1,
    keyId: value.encrypted.keyId,
    jwe: value.encrypted.jwe,
  };
}

function readParameterContext(value: unknown): ParameterEncryptionContext {
  if (
    !isRecord(value) ||
    !isIdentifier(value.repositoryId) ||
    !isIdentifier(value.batchId) ||
    typeof value.parameterName !== "string" ||
    !isRecord(value.origin)
  ) {
    throw new Error("PARAMETER_ENCRYPTION_CONTEXT_INVALID");
  }
  validateParameterNames([value.parameterName]);
  const source = value.origin;
  let origin: ParameterOrigin;
  if (source.type === "BATCH_DEFAULT") {
    origin = { type: "BATCH_DEFAULT" };
  } else if (
    source.type === "SCHEDULE_VALUE" &&
    isIdentifier(source.scheduleId)
  ) {
    origin = { type: "SCHEDULE_VALUE", scheduleId: source.scheduleId };
  } else if (
    source.type === "REQUEST_VALUE" &&
    isIdentifier(source.requestId)
  ) {
    origin = { type: "REQUEST_VALUE", requestId: source.requestId };
  } else {
    throw new Error("PARAMETER_ENCRYPTION_CONTEXT_INVALID");
  }
  return {
    repositoryId: value.repositoryId,
    batchId: value.batchId,
    parameterName: value.parameterName,
    origin,
  };
}

function contextsMatch(
  actual: ParameterEncryptionContext,
  expected: ParameterEncryptionContext,
): boolean {
  if (
    actual.repositoryId !== expected.repositoryId ||
    actual.batchId !== expected.batchId ||
    actual.parameterName !== expected.parameterName
  ) {
    return false;
  }
  const source = actual.origin;
  const target = expected.origin;
  switch (source.type) {
    case "BATCH_DEFAULT":
      return target.type === "BATCH_DEFAULT";
    case "SCHEDULE_VALUE":
      return (
        target.type === "SCHEDULE_VALUE" &&
        source.scheduleId === target.scheduleId
      );
    case "REQUEST_VALUE":
      return (
        target.type === "REQUEST_VALUE" && source.requestId === target.requestId
      );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("\0");
}
