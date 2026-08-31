import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";

import { parseDocument } from "yaml";

import { buildActionBundle } from "./build-action-bundle.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const actions = [
  {
    directory: "actions/dispatcher",
    expected: { main: "dist/index.js", using: "node24" },
  },
  {
    directory: "actions/gate",
    expected: { main: "dist/index.js", using: "node24" },
  },
  {
    directory: "actions/schedule-request",
    expected: { main: "dist/index.js", using: "node24" },
  },
];
const temporaryDirectory = mkdtempSync(
  resolve(tmpdir(), "batchplane-action-artifact-integrity-"),
);

try {
  for (const action of actions) {
    const actionDirectory = resolve(repositoryRoot, action.directory);
    const expectedDirectory = resolve(temporaryDirectory, action.directory);
    const metadata = readActionRuntimeMetadata(action, actionDirectory);
    const current = snapshotArtifacts(metadata.bundleDirectory);

    await buildActionBundle({
      actionDirectory,
      outputDirectory: expectedDirectory,
    });

    const expected = snapshotArtifacts(expectedDirectory);
    assertExpectedArtifactClosure(
      action.directory,
      current,
      metadata.expectedArtifactFiles,
    );
    assertExpectedArtifactClosure(
      `${action.directory} expected bundle`,
      expected,
      metadata.expectedArtifactFiles,
    );

    if (!snapshotsMatch(current, expected)) {
      throw new Error(
        `${action.directory}/dist is stale or incomplete. ${describeDifference(current, expected)} Regenerate artifacts with pnpm build:actions and commit the resulting dist/index.js.`,
      );
    }
  }

  console.log(
    "Action artifact integrity verified without changing checked-in dist.",
  );
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}

function readActionRuntimeMetadata(action, actionDirectory) {
  const metadataPath = resolve(actionDirectory, "action.yml");
  const document = parseDocument(readFileSync(metadataPath, "utf8"));

  if (document.errors.length > 0) {
    throw new Error(
      `${action.directory}/action.yml is invalid YAML: ${document.errors.map((error) => error.message).join("; ")}`,
    );
  }

  const metadata = asRecord(document.toJS(), `${action.directory}/action.yml`);
  const runs = asRecord(metadata.runs, `${action.directory}/action.yml runs`);

  if (runs.using !== action.expected.using) {
    throw new Error(
      `${action.directory}/action.yml runs.using must be ${action.expected.using}; found ${formatMetadataValue(runs.using)}.`,
    );
  }

  if (runs.main !== action.expected.main) {
    throw new Error(
      `${action.directory}/action.yml runs.main must be ${action.expected.main}; found ${formatMetadataValue(runs.main)}.`,
    );
  }

  const expectedBundlePath = resolve(actionDirectory, action.expected.main);
  const declaredBundlePath = resolve(actionDirectory, runs.main);

  if (declaredBundlePath !== expectedBundlePath) {
    throw new Error(
      `${action.directory}/action.yml runs.main does not resolve to the expected bundle.`,
    );
  }

  const bundleDirectory = dirname(expectedBundlePath);
  const expectedArtifactPath = relative(bundleDirectory, expectedBundlePath);

  if (!expectedArtifactPath || expectedArtifactPath.startsWith("..")) {
    throw new Error(
      `${action.directory}/action.yml runs.main must resolve inside its dist directory.`,
    );
  }

  return {
    bundleDirectory,
    expectedArtifactFiles: [expectedArtifactPath],
  };
}

function asRecord(value, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value;
}

function formatMetadataValue(value) {
  return value === undefined ? "missing" : JSON.stringify(value);
}

function assertExpectedArtifactClosure(
  actionDirectory,
  snapshot,
  expectedArtifactFiles,
) {
  const files = [...snapshot.keys()];

  if (
    files.length !== expectedArtifactFiles.length ||
    files.some((file, index) => file !== expectedArtifactFiles[index])
  ) {
    throw new Error(
      `${actionDirectory}/dist must contain only ${expectedArtifactFiles.join(", ")}; found ${files.join(", ") || "no files"}.`,
    );
  }
}

function snapshotArtifacts(directory) {
  const files = listFiles(directory);

  return new Map(
    files.map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(resolve(directory, file)))
        .digest("hex"),
    ]),
  );
}

function listFiles(directory, prefix = "") {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) => {
        const relativePath = `${prefix}${entry.name}`;

        if (entry.isDirectory()) {
          return listFiles(resolve(directory, entry.name), `${relativePath}/`);
        }

        return entry.isFile() ? [relativePath] : [];
      })
      .sort();
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function snapshotsMatch(left, right) {
  if (left.size !== right.size) {
    return false;
  }

  return [...left].every(([file, digest]) => right.get(file) === digest);
}

function describeDifference(current, expected) {
  const currentFiles = [...current.keys()];
  const expectedFiles = [...expected.keys()];
  const extraFiles = currentFiles.filter((file) => !expected.has(file));
  const missingFiles = expectedFiles.filter((file) => !current.has(file));
  const changedFiles = expectedFiles.filter(
    (file) => current.has(file) && current.get(file) !== expected.get(file),
  );
  const details = [
    extraFiles.length > 0 ? `extra files: ${extraFiles.join(", ")}` : "",
    missingFiles.length > 0 ? `missing files: ${missingFiles.join(", ")}` : "",
    changedFiles.length > 0 ? `changed files: ${changedFiles.join(", ")}` : "",
  ].filter(Boolean);

  return details.join("; ");
}
