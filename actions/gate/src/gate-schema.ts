export type GitHubRepositoryRole = "admin" | "maintain" | "write" | "triage";

const batchPlaneApiVersion = "batchplane.io/v1";
const legacyBatchPlaneApiVersion = "batchtrail.io/v1";
const supportedBatchPlaneApiVersions = [
  batchPlaneApiVersion,
  legacyBatchPlaneApiVersion,
] as const;

type BatchPlaneApiVersion = (typeof supportedBatchPlaneApiVersions)[number];

export type ApproverSelector = {
  githubUsers?: string[];
  githubTeams?: string[];
  repositoryRoles?: GitHubRepositoryRole[];
};

export type BatchDefinitionFile = {
  apiVersion: BatchPlaneApiVersion;
  kind: "BatchDefinition";
  metadata: {
    id: string;
    name: string;
  };
  spec: {
    gateRequired: boolean;
    status: "ACTIVE" | "INACTIVE";
    workflow: {
      path: string;
      ref: string;
    };
  };
};

export type RoleMappingFile = {
  apiVersion: BatchPlaneApiVersion;
  kind: "RoleMapping";
  metadata: {
    id: string;
  };
  spec: {
    roles: {
      approver: ApproverSelector;
    };
  };
};

export type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
    };

export type YamlScalar = string | number | boolean | null;

export type YamlValue =
  | YamlScalar
  | YamlValue[]
  | { [key: string]: YamlValue | undefined };

export type YamlDiagnostic = {
  line: number;
  column: number;
  message: string;
};

export type YamlParseResult<T = YamlValue> =
  | {
      ok: true;
      value: T;
    }
  | {
      diagnostics: YamlDiagnostic[];
      ok: false;
    };

type UnknownRecord = Record<string, unknown>;

const repositoryRoleValues = ["admin", "maintain", "write", "triage"] as const;

export function parseYamlDocument(input: string): YamlParseResult {
  const diagnostics: YamlDiagnostic[] = [];
  const root: Record<string, YamlValue | undefined> = {};
  const stack: Array<{
    indent: number;
    value: Record<string, YamlValue | undefined>;
  }> = [{ indent: -2, value: root }];
  const lines = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;

    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      return;
    }

    if (rawLine.includes("\t")) {
      diagnostics.push({
        column: rawLine.indexOf("\t") + 1,
        line: lineNumber,
        message: "Tabs are not supported in BatchPlane YAML indentation.",
      });
      return;
    }

    const indent = countLeadingSpaces(rawLine);

    if (indent % 2 !== 0) {
      diagnostics.push({
        column: indent + 1,
        line: lineNumber,
        message: "Indentation must use two-space levels.",
      });
      return;
    }

    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]!;

    if (indent > parent.indent + 2) {
      diagnostics.push({
        column: indent + 1,
        line: lineNumber,
        message: "Indentation jumps more than one level.",
      });
      return;
    }

    const trimmed = rawLine.trim();
    const separatorIndex = trimmed.indexOf(":");

    if (separatorIndex <= 0) {
      diagnostics.push({
        column: indent + 1,
        line: lineNumber,
        message: "Expected a YAML key followed by ':'.",
      });
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key) {
      diagnostics.push({
        column: indent + 1,
        line: lineNumber,
        message: "YAML keys must not be empty.",
      });
      return;
    }

    if (Object.hasOwn(parent.value, key)) {
      diagnostics.push({
        column: indent + 1,
        line: lineNumber,
        message: `Duplicate YAML key '${key}'.`,
      });
      return;
    }

    if (!rawValue) {
      const child: Record<string, YamlValue | undefined> = {};
      parent.value[key] = child;
      stack.push({ indent, value: child });
      return;
    }

    const parsedValue = parseYamlScalar(rawValue, lineNumber, indent + 1);

    if (parsedValue.ok) {
      parent.value[key] = parsedValue.value;
    } else {
      diagnostics.push(...parsedValue.diagnostics);
    }
  });

  if (diagnostics.length > 0) {
    return { diagnostics, ok: false };
  }

  return { ok: true, value: root };
}

export function validateBatchDefinitionFile(
  file: unknown,
): ValidationResult<BatchDefinitionFile> {
  if (!isRecord(file)) {
    return { ok: false };
  }

  if (
    !isBatchPlaneApiVersion(file.apiVersion) ||
    file.kind !== "BatchDefinition"
  ) {
    return { ok: false };
  }

  const metadata = asRecord(file.metadata);
  const spec = asRecord(file.spec);

  if (!metadata || !spec) {
    return { ok: false };
  }

  if (!isString(metadata.id) || !isString(metadata.name)) {
    return { ok: false };
  }

  const workflow = asRecord(spec.workflow);

  if (!workflow) {
    return { ok: false };
  }

  if (
    !isBoolean(spec.gateRequired) ||
    !isAllowedBatchStatus(spec.status) ||
    !isString(workflow.path) ||
    !isString(workflow.ref)
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      apiVersion: batchPlaneApiVersion,
      kind: "BatchDefinition",
      metadata: {
        id: metadata.id,
        name: metadata.name,
      },
      spec: {
        gateRequired: spec.gateRequired,
        status: spec.status,
        workflow: {
          path: workflow.path,
          ref: workflow.ref,
        },
      },
    },
  };
}

export function validateRoleMappingFile(
  file: unknown,
): ValidationResult<RoleMappingFile> {
  if (!isRecord(file)) {
    return { ok: false };
  }

  if (!isBatchPlaneApiVersion(file.apiVersion) || file.kind !== "RoleMapping") {
    return { ok: false };
  }

  const metadata = asRecord(file.metadata);
  const spec = asRecord(file.spec);
  const roles = asRecord(spec?.roles);
  const approver = asRecord(roles?.approver);

  if (!metadata || !spec || !roles || !approver || !isString(metadata.id)) {
    return { ok: false };
  }

  const githubUsers = readOptionalStringArray(approver.githubUsers);
  const githubTeams = readOptionalStringArray(approver.githubTeams);
  const repositoryRoles = readOptionalRepositoryRolesArray(
    approver.repositoryRoles,
  );

  if (!githubUsers.ok || !githubTeams.ok || !repositoryRoles.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      apiVersion: batchPlaneApiVersion,
      kind: "RoleMapping",
      metadata: { id: metadata.id },
      spec: {
        roles: {
          approver: {
            ...(githubUsers.value ? { githubUsers: githubUsers.value } : {}),
            ...(githubTeams.value ? { githubTeams: githubTeams.value } : {}),
            ...(repositoryRoles.value
              ? { repositoryRoles: repositoryRoles.value }
              : {}),
          },
        },
      },
    },
  };
}

function parseYamlScalar(
  value: string,
  line: number,
  column: number,
): YamlParseResult<YamlValue> {
  if (value === "true") {
    return { ok: true, value: true };
  }

  if (value === "false") {
    return { ok: true, value: false };
  }

  if (value === "null") {
    return { ok: true, value: null };
  }

  if (/^-?\d+(\.\d+)?$/u.test(value)) {
    return { ok: true, value: Number(value) };
  }

  if (value.startsWith('"') || value.startsWith("[") || value.startsWith("{")) {
    try {
      return { ok: true, value: JSON.parse(value) as YamlValue };
    } catch {
      return {
        diagnostics: [
          {
            column,
            line,
            message: "Invalid quoted or inline JSON YAML value.",
          },
        ],
        ok: false,
      };
    }
  }

  return { ok: true, value };
}

function countLeadingSpaces(value: string): number {
  return value.length - value.trimStart().length;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBatchPlaneApiVersion(value: unknown): value is BatchPlaneApiVersion {
  return (
    typeof value === "string" &&
    supportedBatchPlaneApiVersions.includes(value as BatchPlaneApiVersion)
  );
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isAllowedBatchStatus(value: unknown): value is "ACTIVE" | "INACTIVE" {
  return value === "ACTIVE" || value === "INACTIVE";
}

function readOptionalStringArray(
  value: unknown,
): { ok: true; value: string[] | undefined } | { ok: false } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (!Array.isArray(value) || value.some((item) => !isString(item))) {
    return { ok: false };
  }

  return { ok: true, value: value as string[] };
}

function readOptionalRepositoryRolesArray(
  value: unknown,
): { ok: true; value: GitHubRepositoryRole[] | undefined } | { ok: false } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (
    !Array.isArray(value) ||
    value.some((item) => !repositoryRoleValues.includes(item as never))
  ) {
    return { ok: false };
  }

  return { ok: true, value: value as GitHubRepositoryRole[] };
}
