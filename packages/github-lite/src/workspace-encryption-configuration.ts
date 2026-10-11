import { calculateJwkThumbprint, importJWK } from "jose";
import type { GitHubRepositoryContext } from "./github-types.js";
import type { WorkspaceEncryptionConfiguration } from "./parameter-encryption.js";
import {
  parseRepositoryYaml,
  stringifyRepositoryYaml,
} from "./repository-yaml.js";

export const workspaceEncryptionConfigurationPath =
  ".batch-governance/parameter-encryption.yml";

export class WorkspaceEncryptionConfigurationError extends Error {
  constructor() {
    super("Workspace encryption configuration is invalid.");
    this.name = "WorkspaceEncryptionConfigurationError";
  }
}

export async function loadWorkspaceEncryptionConfiguration({
  client,
  repositoryRef,
  ref,
  configPath = ".batch-governance",
}: GitHubRepositoryContext & {
  ref?: string;
  configPath?: string;
}): Promise<WorkspaceEncryptionConfiguration | null> {
  const revision =
    ref ?? (await client.getRepository(repositoryRef)).defaultBranch;
  const file = await client.getFile({
    ...repositoryRef,
    path: `${configPath.replace(/\/+$/u, "")}/parameter-encryption.yml`,
    ref: revision,
  });
  return file ? parseWorkspaceEncryptionConfiguration(file.content) : null;
}

export async function parseWorkspaceEncryptionConfiguration(
  content: string,
): Promise<WorkspaceEncryptionConfiguration> {
  try {
    return await validateWorkspaceEncryptionConfiguration(content);
  } catch {
    throw new WorkspaceEncryptionConfigurationError();
  }
}

async function validateWorkspaceEncryptionConfiguration(
  content: string,
): Promise<WorkspaceEncryptionConfiguration> {
  const parsed = parseRepositoryYaml(content);
  const value: unknown = parsed.ok ? parsed.value : null;
  if (
    !isRecord(value) ||
    !hasOnly(value, ["version", "keyId", "publicKey"]) ||
    value.version !== 1 ||
    typeof value.keyId !== "string"
  )
    throw new Error("Workspace encryption configuration is invalid.");
  const key = value.publicKey;
  if (
    !isRecord(key) ||
    !hasOnly(key, ["kty", "n", "e"]) ||
    key.kty !== "RSA" ||
    typeof key.n !== "string" ||
    typeof key.e !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(key.n) ||
    !/^[A-Za-z0-9_-]+$/.test(key.e)
  )
    throw new Error("Workspace encryption public key is invalid.");
  const publicKey = { kty: "RSA" as const, n: key.n, e: key.e };
  const modulus = Uint8Array.from(
    atob(key.n.replaceAll("-", "+").replaceAll("_", "/")),
    (byte) => byte.charCodeAt(0),
  );
  if (
    modulus.length !== 256 ||
    (modulus[0]! & 128) === 0 ||
    (await calculateJwkThumbprint(publicKey, "sha256")) !== value.keyId
  )
    throw new Error("Workspace encryption key identity or size is invalid.");
  await importJWK(publicKey, "RSA-OAEP-256");
  return { version: 1, keyId: value.keyId, publicKey };
}

export function buildWorkspaceEncryptionConfiguration(
  configuration: WorkspaceEncryptionConfiguration,
): string {
  return stringifyRepositoryYaml({
    version: configuration.version,
    keyId: configuration.keyId,
    publicKey: {
      kty: configuration.publicKey.kty,
      n: configuration.publicKey.n,
      e: configuration.publicKey.e,
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, keys: string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
