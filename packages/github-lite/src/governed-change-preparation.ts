import {
  createTargetRevisionDigest,
  type BatchDefinition,
  type GovernedChangeArtifact,
} from "@batchplane/domain";
import { sha256BytesHex } from "@batchplane/digest";
import type {
  BatchChangeDraft,
  GovernedChangePreviewFile,
} from "@batchplane/ui-client";

import {
  getBatchArtifactPath,
  getBatchDefinitionPath,
  parseBatchDefinitionYaml,
  serializeBatchDefinitionYaml,
  toBatchDefinition,
} from "./batch-definition-codec.js";
import { buildBatchWorkflowYaml } from "./github-workflow.js";
import type { GitHubLiteClient, RepoRef } from "./index.js";

export type PreparedGovernedChange = {
  batch: BatchDefinition;
  files: PreparedGovernedFile[];
  title: string;
  type: "REGISTER" | "CHANGE" | "DELETE";
};

export type PreparedGovernedFile = {
  bytes: Uint8Array | null | undefined;
  kind: GovernedChangeArtifact["kind"];
  path: string;
};

export function prepareGovernedChange(
  draft: BatchChangeDraft,
  governedChangeId: string,
): PreparedGovernedChange {
  const currentArtifactPath = draft.batch.existingArtifact?.locator;
  const nextArtifactPath = resolveArtifactPath(draft, currentArtifactPath);
  const batch = toBatchDefinition(draft.batch, {
    artifactPath: nextArtifactPath,
    governedChangeId,
    schedules: draft.schedules,
  });
  const batchPath = getBatchDefinitionPath(batch.batchId);
  const type = toGovernedChangeType(draft.mode);
  const title = `${toTitleVerb(draft.mode)} batch ${batch.batchId}`;

  if (type === "DELETE") {
    return {
      batch,
      files: [
        { bytes: null, kind: "BATCH_DEFINITION", path: batchPath },
        { bytes: null, kind: "WORKFLOW", path: batch.workflow.path },
        ...(currentArtifactPath
          ? [
              {
                bytes: null,
                kind: "ARTIFACT" as const,
                path: currentArtifactPath,
              },
            ]
          : []),
      ],
      title,
      type,
    };
  }

  const batchWithArtifact = {
    ...batch,
    execution: batch.execution
      ? { ...batch.execution, artifactPath: nextArtifactPath || undefined }
      : undefined,
  };

  return {
    batch: batchWithArtifact,
    files: [
      {
        bytes: new TextEncoder().encode(
          serializeBatchDefinitionYaml(batchWithArtifact),
        ),
        kind: "BATCH_DEFINITION",
        path: batchPath,
      },
      {
        bytes: new TextEncoder().encode(
          buildBatchWorkflowYaml(batchWithArtifact),
        ),
        kind: "WORKFLOW",
        path: batchWithArtifact.workflow.path,
      },
      ...prepareArtifactFiles({
        currentArtifactPath,
        nextArtifactPath,
        uploadedArtifact: draft.artifact,
      }),
    ],
    title,
    type,
  };
}

export function assertPreparedChangeTargets(
  type: PreparedGovernedChange["type"],
  files: GovernedChangePreviewFile[],
): void {
  const definition = files.find((file) =>
    file.path.includes(".batch-governance/batches/"),
  );
  const workflow = files.find((file) =>
    file.path.startsWith(".github/workflows/"),
  );

  if (
    type === "REGISTER" &&
    (definition?.status !== "ADDED" || workflow?.status !== "ADDED")
  ) {
    throw new Error("A governed batch definition or workflow already exists.");
  }

  if (
    type === "CHANGE" &&
    (!definition ||
      definition.status === "ADDED" ||
      !workflow ||
      workflow.status === "ADDED")
  ) {
    throw new Error("The governed batch definition no longer exists.");
  }

  if (
    type === "DELETE" &&
    (definition?.status !== "DELETED" || workflow?.status !== "DELETED")
  ) {
    throw new Error(
      "The governed batch definition or workflow no longer exists.",
    );
  }
}

export async function loadPreparedChangePreviewFiles(
  client: GitHubLiteClient,
  repository: RepoRef,
  ref: string,
  files: PreparedGovernedChange["files"],
): Promise<GovernedChangePreviewFile[]> {
  return Promise.all(
    files.map(async (file) => {
      const baseFile = await client.getFile({
        ...repository,
        path: file.path,
        ref,
      });
      const baseBytes = baseFile ? fileBytes(baseFile) : undefined;
      if (file.kind === "ARTIFACT" && file.bytes === undefined && !baseFile) {
        throw new Error(
          `The registered artifact is unavailable at ${file.path}. Upload a replacement before requesting this change.`,
        );
      }
      const nextBytes = file.bytes === undefined ? baseBytes : file.bytes;
      const isBinary = file.kind === "ARTIFACT";
      const baseContent = isBinary ? undefined : (baseFile?.content ?? "");
      const nextContent = isBinary
        ? undefined
        : nextBytes
          ? new TextDecoder().decode(nextBytes)
          : "";

      return {
        baseContent,
        beforeDigest: baseBytes ? await sha256BytesHex(baseBytes) : null,
        afterDigest: nextBytes ? await sha256BytesHex(nextBytes) : null,
        contentKind: isBinary ? "BINARY" : "TEXT",
        nextContent,
        path: file.path,
        status:
          !baseFile && file.bytes !== null
            ? "ADDED"
            : baseFile && file.bytes === null
              ? "DELETED"
              : bytesEqual(baseBytes, nextBytes ?? undefined)
                ? "UNCHANGED"
                : "MODIFIED",
      };
    }),
  );
}

export async function createPreparedChangeTargetDigest({
  client,
  prepared,
  ref,
  repository,
}: {
  client: GitHubLiteClient;
  prepared: PreparedGovernedChange;
  ref: string;
  repository: RepoRef;
}): Promise<string> {
  return createTargetRevisionDigest(
    await createPreparedChangeArtifactEvidence({
      client,
      prepared,
      ref,
      repository,
    }),
  );
}

export async function createPreparedChangeArtifactEvidence({
  client,
  prepared,
  ref,
  repository,
}: {
  client: GitHubLiteClient;
  prepared: PreparedGovernedChange;
  ref: string;
  repository: RepoRef;
}): Promise<GovernedChangeArtifact[]> {
  return Promise.all(
    prepared.files.map(async (file) => {
      const baseFile = await client.getFile({
        ...repository,
        path: file.path,
        ref,
      });
      const beforeBytes = baseFile ? fileBytes(baseFile) : undefined;
      const afterBytes = file.bytes === undefined ? beforeBytes : file.bytes;

      if (file.kind === "ARTIFACT" && file.bytes === undefined && !baseFile) {
        throw new Error(
          `The registered artifact is unavailable at ${file.path}. Upload a replacement before requesting this change.`,
        );
      }

      return {
        afterDigest: afterBytes ? await sha256BytesHex(afterBytes) : null,
        beforeDigest: beforeBytes ? await sha256BytesHex(beforeBytes) : null,
        kind: file.kind,
        path: file.path,
      };
    }),
  );
}

export async function writePreparedGovernedChange({
  baseSha,
  branch,
  client,
  prepared,
  repository,
  title,
}: {
  baseSha: string;
  branch: string;
  client: GitHubLiteClient;
  prepared: PreparedGovernedChange;
  repository: RepoRef;
  title: string;
}): Promise<void> {
  await client.createBranch({ ...repository, branch, sha: baseSha });

  for (const file of prepared.files) {
    const baseFile = await client.getFile({
      ...repository,
      path: file.path,
      ref: branch,
    });

    if (file.bytes === null) {
      if (baseFile) {
        await client.deleteFile({
          ...repository,
          branch,
          message: title,
          path: file.path,
          sha: baseFile.sha,
        });
      }
      continue;
    }

    if (file.bytes === undefined) continue;
    if (baseFile && bytesEqual(fileBytes(baseFile), file.bytes)) continue;

    await client.putFile({
      ...repository,
      branch,
      content:
        file.kind === "ARTIFACT"
          ? bytesToBase64(file.bytes)
          : new TextDecoder().decode(file.bytes),
      ...(file.kind === "ARTIFACT" ? { encoding: "base64" as const } : {}),
      message: title,
      path: file.path,
      ...(baseFile ? { sha: baseFile.sha } : {}),
    });
  }
}

function bytesEqual(
  left: Uint8Array | undefined,
  right: Uint8Array | undefined,
): boolean {
  return Boolean(
    left &&
    right &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]),
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
}

function fileBytes(file: {
  content: string;
  contentBase64?: string;
}): Uint8Array {
  if (!file.contentBase64) return new TextEncoder().encode(file.content);

  return Uint8Array.from(atob(file.contentBase64), (character) =>
    character.charCodeAt(0),
  );
}

export async function loadExistingBatchDefinition(
  repository: RepoRef,
  client: GitHubLiteClient,
  batchId: string | undefined,
): Promise<BatchDefinition | null> {
  if (!batchId) return null;

  const repo = await client.getRepository(repository);
  const file = await client.getFile({
    ...repository,
    path: getBatchDefinitionPath(batchId),
    ref: repo.defaultBranch,
  });

  return file ? parseBatchDefinitionYaml(file.content) : null;
}

export function toBatchChangeDraft(
  batch: BatchDefinition,
): BatchChangeDraft["batch"] {
  return {
    batchId: batch.batchId,
    ...(batch.execution?.artifactPath
      ? {
          artifactFileName: batch.execution.artifactPath.split("/").at(-1),
          existingArtifact: {
            fileName: batch.execution.artifactPath.split("/").at(-1) ?? "",
            locator: batch.execution.artifactPath,
          },
        }
      : {}),
    criticality: batch.criticality,
    domain: batch.domain,
    environment: batch.environment,
    name: batch.name,
    owner: batch.owner,
    runCommand: batch.execution?.command ?? "",
    runnerLabel: Array.isArray(batch.execution?.runsOn)
      ? batch.execution.runsOn.join(", ")
      : (batch.execution?.runsOn ?? "ubuntu-latest"),
    status: batch.status,
    workflowRef: batch.workflow.ref,
  };
}

function resolveArtifactPath(
  draft: BatchChangeDraft,
  currentArtifactPath: string | undefined,
): string | undefined {
  if (!draft.artifact) return currentArtifactPath;

  // Existing locators are opaque repository paths. A same-name replacement
  // must replace that exact file rather than recreating a guessed path.
  if (
    currentArtifactPath &&
    draft.batch.existingArtifact?.fileName === draft.artifact.fileName
  ) {
    return currentArtifactPath;
  }

  return getBatchArtifactPath(draft.batch.batchId, draft.artifact.fileName);
}

function prepareArtifactFiles({
  currentArtifactPath,
  nextArtifactPath,
  uploadedArtifact,
}: {
  currentArtifactPath?: string;
  nextArtifactPath?: string;
  uploadedArtifact: BatchChangeDraft["artifact"];
}): PreparedGovernedFile[] {
  if (!nextArtifactPath) return [];
  if (!uploadedArtifact) {
    return [{ bytes: undefined, kind: "ARTIFACT", path: nextArtifactPath }];
  }

  return [
    ...(currentArtifactPath && currentArtifactPath !== nextArtifactPath
      ? [{ bytes: null, kind: "ARTIFACT" as const, path: currentArtifactPath }]
      : []),
    { bytes: uploadedArtifact.bytes, kind: "ARTIFACT", path: nextArtifactPath },
  ];
}

function toGovernedChangeType(
  mode: BatchChangeDraft["mode"],
): PreparedGovernedChange["type"] {
  return mode === "create"
    ? "REGISTER"
    : mode === "delete"
      ? "DELETE"
      : "CHANGE";
}

function toTitleVerb(mode: BatchChangeDraft["mode"]): string {
  return mode === "create"
    ? "Register"
    : mode === "delete"
      ? "Delete"
      : "Change";
}
