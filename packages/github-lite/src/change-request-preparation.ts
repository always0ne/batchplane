import { sha256BytesHex } from "@batchplane/digest";
import type {
  BatchChangeDraft,
  ChangeRequestPreviewFile,
} from "@batchplane/ui-client";

import {
  getBatchArtifactPath,
  getBatchDefinitionPath,
  parseBatchDefinitionYaml,
  serializeBatchDefinitionYaml,
  toBatchDefinition,
} from "./batch-definition-codec.js";
import { buildBatchWorkflowYaml } from "./github-workflow.js";
import {
  createTargetRevisionDigest,
  type ChangeRequestArtifact,
} from "./change-request-evidence.js";
import type { GitHubBatchDefinition } from "./github-batch-definition.js";
import type { GitHubLiteClient, RepoRef } from "./github-types.js";

export type PreparedChangeRequest = {
  batch: GitHubBatchDefinition;
  files: PreparedChangeRequestFile[];
  title: string;
  type: "REGISTER" | "CHANGE" | "DELETE";
};

export type PreparedChangeRequestFile = {
  bytes: Uint8Array | null | undefined;
  kind: ChangeRequestArtifact["kind"];
  path: string;
};

export function prepareChangeRequest(
  draft: BatchChangeDraft,
  changeRequestId: string,
): PreparedChangeRequest {
  const currentArtifactPath = draft.execution.existingFile?.locator;
  const nextArtifactPath = resolveArtifactPath(draft, currentArtifactPath);
  const batch = toBatchDefinition(
    {
      ...draft.batch,
      runCommand: draft.execution.command,
      runnerLabel: draft.execution.runnerLabel,
      workflowRef: draft.execution.ref,
    },
    {
      artifactPath: nextArtifactPath,
      governedChangeId: changeRequestId,
      schedules: draft.schedules,
    },
  );
  const batchPath = getBatchDefinitionPath(batch.batchId);
  const type = toChangeRequestType(draft.mode);
  const title =
    draft.remediation === "REVIEW_CURRENT"
      ? `Review current batch revision ${batch.batchId}`
      : draft.remediation === "RESTORE_LAST_APPROVED"
        ? `Restore approved batch revision ${batch.batchId}`
        : `${toTitleVerb(draft.mode)} batch ${batch.batchId}`;

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
        removeExistingArtifact: draft.execution.removeExistingArtifact,
        uploadedArtifact: draft.execution.upload,
      }),
    ],
    title,
    type,
  };
}

export function assertPreparedChangeTargets(
  type: PreparedChangeRequest["type"],
  files: ChangeRequestPreviewFile[],
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
  files: PreparedChangeRequest["files"],
): Promise<ChangeRequestPreviewFile[]> {
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

export function hasEffectivePreparedChange(
  files: ChangeRequestPreviewFile[],
): boolean {
  return files.some((file) => {
    if (file.status === "UNCHANGED") return false;
    if (file.path.includes(".batch-governance/batches/")) {
      return hasEffectiveBatchDefinitionChange(file);
    }
    return true;
  });
}

function hasEffectiveBatchDefinitionChange(
  file: ChangeRequestPreviewFile,
): boolean {
  if (file.status !== "MODIFIED" || !file.baseContent || !file.nextContent) {
    return file.status !== "UNCHANGED";
  }

  try {
    return (
      serializeWithoutChangeRequestId(file.baseContent) !==
      serializeWithoutChangeRequestId(file.nextContent)
    );
  } catch {
    return true;
  }
}

function serializeWithoutChangeRequestId(content: string): string {
  const definition = parseBatchDefinitionYaml(content);
  return serializeBatchDefinitionYaml({
    ...definition,
    governedChangeId: undefined,
  });
}

export async function createPreparedChangeTargetDigest({
  client,
  prepared,
  ref,
  repository,
}: {
  client: GitHubLiteClient;
  prepared: PreparedChangeRequest;
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
  prepared: PreparedChangeRequest;
  ref: string;
  repository: RepoRef;
}): Promise<ChangeRequestArtifact[]> {
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

export async function writePreparedChangeRequest({
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
  prepared: PreparedChangeRequest;
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
): Promise<GitHubBatchDefinition | null> {
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
  batch: GitHubBatchDefinition,
): Pick<BatchChangeDraft, "batch" | "execution"> {
  return {
    batch: {
      batchId: batch.batchId,
      criticality: batch.criticality,
      domain: batch.domain,
      environment: batch.environment,
      name: batch.name,
      owner: batch.owner,
      status: batch.status,
    },
    execution: {
      command: batch.execution?.command ?? "",
      ...(batch.execution?.artifactPath
        ? {
            existingFile: {
              fileName: batch.execution.artifactPath.split("/").at(-1) ?? "",
              locator: batch.execution.artifactPath,
            },
          }
        : {}),
      platform: "GITHUB_ACTIONS",
      ref: batch.workflow.ref,
      runnerLabel: Array.isArray(batch.execution?.runsOn)
        ? batch.execution.runsOn.join(", ")
        : (batch.execution?.runsOn ?? "ubuntu-latest"),
    },
  };
}

function resolveArtifactPath(
  draft: BatchChangeDraft,
  currentArtifactPath: string | undefined,
): string | undefined {
  if (draft.execution.removeExistingArtifact) return undefined;
  if (!draft.execution.upload) return currentArtifactPath;

  // Existing locators are opaque repository paths. A same-name replacement
  // must replace that exact file rather than recreating a guessed path.
  if (
    currentArtifactPath &&
    draft.execution.existingFile?.fileName === draft.execution.upload.fileName
  ) {
    return currentArtifactPath;
  }

  return getBatchArtifactPath(
    draft.batch.batchId,
    draft.execution.upload.fileName,
  );
}

function prepareArtifactFiles({
  currentArtifactPath,
  nextArtifactPath,
  removeExistingArtifact,
  uploadedArtifact,
}: {
  currentArtifactPath?: string;
  nextArtifactPath?: string;
  removeExistingArtifact?: boolean;
  uploadedArtifact: BatchChangeDraft["execution"]["upload"];
}): PreparedChangeRequestFile[] {
  if (!nextArtifactPath) {
    return currentArtifactPath && removeExistingArtifact
      ? [{ bytes: null, kind: "ARTIFACT", path: currentArtifactPath }]
      : [];
  }
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

function toChangeRequestType(
  mode: BatchChangeDraft["mode"],
): PreparedChangeRequest["type"] {
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
