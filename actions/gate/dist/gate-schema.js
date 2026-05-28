const batchPlaneApiVersion = "batchplane.io/v1";
const legacyBatchPlaneApiVersion = "batchtrail.io/v1";
const supportedBatchPlaneApiVersions = [
    batchPlaneApiVersion,
    legacyBatchPlaneApiVersion,
];
const repositoryRoleValues = ["admin", "maintain", "write", "triage"];
const workspaceApprovalModeValues = [
    "SELF_APPROVAL_BLOCKED",
    "SELF_APPROVAL_ALLOWED",
    "AUTO_APPROVE",
];
export function parseYamlDocument(input) {
    const diagnostics = [];
    const root = {};
    const stack = [{ indent: -2, value: root }];
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
        while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
            stack.pop();
        }
        const parent = stack[stack.length - 1];
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
            const child = {};
            parent.value[key] = child;
            stack.push({ indent, value: child });
            return;
        }
        const parsedValue = parseYamlScalar(rawValue, lineNumber, indent + 1);
        if (parsedValue.ok) {
            parent.value[key] = parsedValue.value;
        }
        else {
            diagnostics.push(...parsedValue.diagnostics);
        }
    });
    if (diagnostics.length > 0) {
        return { diagnostics, ok: false };
    }
    return { ok: true, value: root };
}
export function validateBatchDefinitionFile(file) {
    if (!isRecord(file)) {
        return { ok: false };
    }
    if (!isBatchPlaneApiVersion(file.apiVersion) ||
        file.kind !== "BatchDefinition") {
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
    if (!isBoolean(spec.gateRequired) ||
        !isAllowedBatchStatus(spec.status) ||
        !isString(workflow.path) ||
        !isString(workflow.ref)) {
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
export function validateRoleMappingFile(file) {
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
    const repositoryRoles = readOptionalRepositoryRolesArray(approver.repositoryRoles);
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
export function validateWorkspacePolicyFile(file) {
    if (!isRecord(file)) {
        return { ok: false };
    }
    if (!isBatchPlaneApiVersion(file.apiVersion) ||
        file.kind !== "WorkspacePolicy") {
        return { ok: false };
    }
    const metadata = asRecord(file.metadata);
    const spec = asRecord(file.spec);
    const approval = asRecord(spec?.approval);
    if (!metadata ||
        !spec ||
        !approval ||
        !isString(metadata.id) ||
        !isWorkspaceApprovalMode(approval.mode)) {
        return { ok: false };
    }
    return {
        ok: true,
        value: {
            apiVersion: batchPlaneApiVersion,
            kind: "WorkspacePolicy",
            metadata: { id: metadata.id },
            spec: {
                approval: {
                    mode: approval.mode,
                },
            },
        },
    };
}
function parseYamlScalar(value, line, column) {
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
            return { ok: true, value: JSON.parse(value) };
        }
        catch {
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
function countLeadingSpaces(value) {
    return value.length - value.trimStart().length;
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function asRecord(value) {
    return isRecord(value) ? value : null;
}
function isString(value) {
    return typeof value === "string";
}
function isBatchPlaneApiVersion(value) {
    return (typeof value === "string" &&
        supportedBatchPlaneApiVersions.includes(value));
}
function isBoolean(value) {
    return typeof value === "boolean";
}
function isAllowedBatchStatus(value) {
    return value === "ACTIVE" || value === "INACTIVE";
}
function isWorkspaceApprovalMode(value) {
    return workspaceApprovalModeValues.includes(value);
}
function readOptionalStringArray(value) {
    if (value === undefined) {
        return { ok: true, value: undefined };
    }
    if (!Array.isArray(value) || value.some((item) => !isString(item))) {
        return { ok: false };
    }
    return { ok: true, value: value };
}
function readOptionalRepositoryRolesArray(value) {
    if (value === undefined) {
        return { ok: true, value: undefined };
    }
    if (!Array.isArray(value) ||
        value.some((item) => !repositoryRoleValues.includes(item))) {
        return { ok: false };
    }
    return { ok: true, value: value };
}
