import { appendFileSync } from "node:fs";
import { parseYamlDocument, validateBatchDefinitionFile, validateRoleMappingFile, validateWorkspacePolicyFile, } from "./gate-schema.js";
export function verifyLiteInput(input) {
    if (input.mode !== "lite") {
        return {
            result: "DENY",
            reasonCode: "UNSUPPORTED_MODE",
            message: "Only lite mode is scaffolded.",
        };
    }
    if (!input.batchId) {
        return {
            result: "DENY",
            reasonCode: "BATCH_ID_REQUIRED",
            message: "Batch ID is required.",
        };
    }
    if ((input.runAttempt ?? 1) > 1) {
        return {
            result: "DENY",
            reasonCode: "RERUN_NOT_AUTHORIZED",
            message: "GitHub Actions reruns are not authorized by BatchPlane. Create a new execution request or approved retry instead.",
        };
    }
    if (!input.requestId) {
        return {
            result: "DENY",
            reasonCode: "EXECUTION_REQUEST_REQUIRED",
            message: "Execution request evidence is required.",
        };
    }
    if (!input.approvalSource || !input.approvalRef) {
        return {
            result: "DENY",
            reasonCode: "APPROVAL_EVIDENCE_REQUIRED",
            message: "Approval evidence source and reference are required.",
        };
    }
    if (!input.requestDigest?.startsWith("sha256:")) {
        return {
            result: "DENY",
            reasonCode: "REQUEST_DIGEST_REQUIRED",
            message: "Approved request digest is required.",
        };
    }
    return { result: "ALLOW", message: "Execution request evidence is present." };
}
export async function verifyLiteAuthorization(input) {
    const inputResult = verifyLiteInput(input);
    if (inputResult.result === "DENY") {
        return inputResult;
    }
    const expectedActor = input.expectedDispatcherActor ?? "github-actions[bot]";
    if (input.actor && input.actor !== expectedActor) {
        return {
            result: "DENY",
            reasonCode: "DIRECT_DISPATCH_NOT_AUTHORIZED",
            message: `Workflow actor ${input.actor} is not the BatchPlane dispatcher actor ${expectedActor}.`,
        };
    }
    if (!input.githubToken || !input.repository) {
        return {
            result: "DENY",
            reasonCode: "GITHUB_EVIDENCE_LOOKUP_REQUIRED",
            message: "GitHub token and repository are required to verify evidence.",
        };
    }
    const repository = parseRepository(input.repository);
    const client = createGateGitHubClient({
        apiBaseUrl: input.apiBaseUrl ?? "https://api.github.com",
        fetcher: input.fetcher ?? fetch,
        owner: repository.owner,
        repo: repository.repo,
        token: input.githubToken,
    });
    let evidence;
    try {
        evidence = await findGitHubApprovalEvidence({
            client,
            requestId: input.requestId ?? "",
        });
    }
    catch (error) {
        return deny("GITHUB_EVIDENCE_LOOKUP_FAILED", `GitHub evidence lookup failed: ${toErrorMessage(error)}`);
    }
    if (!evidence.request) {
        return deny("REQUEST_EVIDENCE_NOT_FOUND", "Execution request Issue evidence was not found.");
    }
    if (evidence.request.requestId !== input.requestId ||
        evidence.request.batchId !== input.batchId ||
        evidence.request.requestDigest !== input.requestDigest) {
        return deny("REQUEST_EVIDENCE_MISMATCH", "Execution request evidence does not match workflow inputs.");
    }
    if (evidence.request.status !== "REQUESTED") {
        return deny("REQUEST_NOT_REQUESTED", `Execution request status is ${evidence.request.status}.`);
    }
    if (input.approvalSource !== "issue") {
        return deny("APPROVAL_SOURCE_NOT_SUPPORTED", `Approval source ${input.approvalSource} is not supported.`);
    }
    if (input.approvalRef !== evidence.request.requestId) {
        return deny("APPROVAL_REFERENCE_MISMATCH", "Approval reference does not match the execution request.");
    }
    const batchValidation = await validateBatchPolicyEvidence({
        batchId: input.batchId,
        client,
        configPath: input.configPath,
        inputRef: input.ref,
        repository,
        request: evidence.request,
    });
    if (batchValidation.result === "DENY") {
        return batchValidation;
    }
    const scheduleValidation = validateScheduleMapping({
        request: evidence.request,
        scheduleId: input.scheduleId,
    });
    if (scheduleValidation.result === "DENY") {
        return scheduleValidation;
    }
    if (!evidence.approval) {
        return deny("EXECUTION_REQUEST_NOT_APPROVED", "Execution request does not have approved comment evidence.");
    }
    if (evidence.approval.edited) {
        return deny("APPROVAL_COMMENT_EDITED", "Execution approval comment was edited after creation.");
    }
    if (evidence.approval.commandDigest &&
        evidence.approval.commandDigest !== evidence.request.requestDigest) {
        return deny("REQUEST_DIGEST_MISMATCH", "Approval command digest does not match execution request digest.");
    }
    if (evidence.approval.requestDigest !== input.requestDigest ||
        evidence.approval.requestDigest !== evidence.request.requestDigest) {
        return deny("REQUEST_DIGEST_MISMATCH", "Execution approval digest does not match execution request digest.");
    }
    let workspaceApprovalMode;
    try {
        workspaceApprovalMode = await readWorkspaceApprovalMode({
            client,
            configPath: input.configPath,
            ref: evidence.request.workflowRef || input.ref,
        });
    }
    catch (error) {
        return deny("WORKSPACE_POLICY_LOOKUP_FAILED", `Workspace policy lookup failed: ${toErrorMessage(error)}`);
    }
    if (evidence.approval.approver === evidence.request.requestedBy &&
        workspaceApprovalMode !== "SELF_APPROVAL_ALLOWED") {
        return deny("SELF_APPROVAL_NOT_ALLOWED", "Requester and approver must be different users.");
    }
    const selfApprovalAllowedWithoutRoleMapping = evidence.approval.approver === evidence.request.requestedBy &&
        workspaceApprovalMode === "SELF_APPROVAL_ALLOWED";
    const approverAuthorized = await verifyApproverAuthorization({
        allowMissingRoleMapping: selfApprovalAllowedWithoutRoleMapping,
        approver: evidence.approval.approver,
        client,
        configPath: input.configPath,
        ref: evidence.request.workflowRef || input.ref,
        repository,
    });
    if (!approverAuthorized.allowed) {
        return deny("APPROVER_NOT_AUTHORIZED", approverAuthorized.message ||
            `Approver @${evidence.approval.approver} is not authorized.`);
    }
    return {
        result: "ALLOW",
        message: "Execution request, approval evidence, and batch policy are verified.",
    };
}
export function readGateInputFromEnv(env = process.env) {
    return {
        mode: readActionInput(env, "mode"),
        batchId: readActionInput(env, "batch-id"),
        configPath: readActionInput(env, "config-path") || ".batch-governance",
        ref: readOptionalActionInput(env, "ref"),
        scheduleId: readOptionalActionInput(env, "schedule-id"),
        requestId: readOptionalActionInput(env, "request-id"),
        approvalSource: readOptionalActionInput(env, "approval-source"),
        approvalRef: readOptionalActionInput(env, "approval-ref"),
        requestDigest: readOptionalActionInput(env, "request-digest"),
        runAttempt: readRunAttempt(env),
        githubToken: readOptionalActionInput(env, "github-token") ?? env.GITHUB_TOKEN,
        repository: env.GITHUB_REPOSITORY,
        actor: env.GITHUB_ACTOR,
        expectedDispatcherActor: readOptionalActionInput(env, "dispatcher-actor") ?? "github-actions[bot]",
        apiBaseUrl: env.GITHUB_API_URL,
    };
}
export async function runGateFromEnv(env = process.env) {
    const input = readGateInputFromEnv(env);
    const result = await verifyLiteAuthorization(input);
    writeGateOutputs(result, env);
    writeGateSummary(result, input, env);
    if (result.result === "DENY") {
        console.error(`BatchPlane Gate denied execution: ${result.reasonCode}`);
        console.error(result.message);
        process.exitCode = 1;
        return result;
    }
    console.log(`BatchPlane Gate allowed execution: ${result.message}`);
    return result;
}
function readActionInput(env, name) {
    const envKey = `INPUT_${name.toUpperCase()}`;
    const fallbackKey = envKey.replaceAll("-", "_");
    return (env[envKey] ?? env[fallbackKey] ?? "").trim();
}
function readOptionalActionInput(env, name) {
    const value = readActionInput(env, name);
    return value || undefined;
}
function readRunAttempt(env) {
    const value = Number.parseInt(env.GITHUB_RUN_ATTEMPT ?? "1", 10);
    return Number.isFinite(value) && value > 0 ? value : 1;
}
function deny(reasonCode, message) {
    return {
        message,
        reasonCode,
        result: "DENY",
    };
}
function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
async function findGitHubApprovalEvidence({ client, requestId, }) {
    const issue = await client.findExecutionRequestIssue(requestId);
    if (!issue) {
        return { approval: null, request: null };
    }
    const request = parseExecutionRequestEvidence(issue.body);
    if (!request) {
        return { approval: null, request: null };
    }
    const comments = await client.listIssueComments(issue.number);
    const approval = comments
        .map(parseExecutionApprovalEvidence)
        .find((evidence) => evidence
        ? evidence.requestId === request.requestId &&
            evidence.batchId === request.batchId &&
            evidence.requestDigest === request.requestDigest
        : false) ?? null;
    return { approval, request };
}
async function validateBatchPolicyEvidence({ batchId, client, configPath, inputRef, repository, request, }) {
    const effectiveConfigPath = configPath.replace(/\/+$/u, "");
    const effectiveRef = inputRef || request.workflowRef;
    const batchPath = `${effectiveConfigPath}/batches/${batchId}.yml`;
    const batchFile = await client.getFile(batchPath, effectiveRef);
    if (!batchFile) {
        return deny("BATCH_NOT_FOUND", `Batch definition was not found: ${batchPath} (${effectiveRef || "default ref"}).`);
    }
    const snapshot = parseBatchDefinitionSnapshot(batchFile.content);
    if (!snapshot) {
        return deny("BATCH_DEFINITION_INVALID", `Batch definition is invalid: ${batchPath}.`);
    }
    if (snapshot.status !== "ACTIVE") {
        return deny("BATCH_NOT_ACTIVE", `Batch ${batchId} is ${snapshot.status} and cannot run.`);
    }
    if (!snapshot.gateRequired) {
        return deny("GATE_REQUIRED", `Batch ${batchId} does not enforce BatchPlane Gate.`);
    }
    if (request.workflowRef && snapshot.workflowRef) {
        const requestRef = request.workflowRef.trim();
        const registeredRef = snapshot.workflowRef.trim();
        if (requestRef && registeredRef && requestRef !== registeredRef) {
            return deny("REF_NOT_ALLOWED", `Workflow ref ${requestRef} is not allowed for batch ${batchId}; expected ${registeredRef}.`);
        }
    }
    if (request.workflowPath && snapshot.workflowPath) {
        const requestPath = request.workflowPath.trim();
        const registeredPath = snapshot.workflowPath.trim();
        if (requestPath && registeredPath && requestPath !== registeredPath) {
            return deny("WORKFLOW_NOT_ALLOWED", `Workflow path ${requestPath} is not registered for batch ${batchId}.`);
        }
    }
    if (!effectiveRef) {
        return deny("REQUEST_EVIDENCE_MISMATCH", `Workflow ref information is missing for batch ${batchId} validation.`);
    }
    if (repository.owner.trim() === "") {
        return deny("UNKNOWN", "Repository owner is required for team validation.");
    }
    return { message: "Batch policy evidence is verified.", result: "ALLOW" };
}
async function readWorkspaceApprovalMode({ client, configPath, ref, }) {
    const effectiveRef = ref?.trim();
    if (!effectiveRef) {
        return "SELF_APPROVAL_BLOCKED";
    }
    const workspacePolicyPath = `${configPath.replace(/\/+$/u, "")}/workspace.yml`;
    const workspacePolicyFile = await client.getFile(workspacePolicyPath, effectiveRef);
    if (!workspacePolicyFile) {
        return "SELF_APPROVAL_BLOCKED";
    }
    const parsed = parseYamlDocument(workspacePolicyFile.content);
    if (!parsed.ok) {
        throw new Error(`Workspace policy YAML is invalid: ${workspacePolicyPath}.`);
    }
    const validated = validateWorkspacePolicyFile(parsed.value);
    if (!validated.ok) {
        throw new Error(`Workspace policy is invalid: ${workspacePolicyPath}.`);
    }
    return validated.value.spec.approval.mode;
}
function validateScheduleMapping({ request, scheduleId, }) {
    if (!scheduleId) {
        return { message: "Schedule mapping is not required.", result: "ALLOW" };
    }
    if (!request.scheduleId || request.scheduleId !== scheduleId) {
        return deny("SCHEDULE_NOT_MAPPED", `Schedule ${scheduleId} is not mapped to this execution request.`);
    }
    return { message: "Schedule mapping is verified.", result: "ALLOW" };
}
async function verifyApproverAuthorization({ allowMissingRoleMapping, approver, client, configPath, ref, repository, }) {
    const effectiveRef = ref?.trim();
    if (!effectiveRef) {
        return {
            allowed: false,
            message: "Workflow ref is required for approver authorization.",
        };
    }
    const roleMappingPath = `${configPath.replace(/\/+$/u, "")}/policies/role-mapping.yml`;
    const roleMappingFile = await client.getFile(roleMappingPath, effectiveRef);
    if (!roleMappingFile) {
        if (allowMissingRoleMapping) {
            return { allowed: true };
        }
        return {
            allowed: false,
            message: `Role mapping file was not found: ${roleMappingPath}.`,
        };
    }
    const selector = parseApproverSelectorFromRoleMappingFile(roleMappingFile.content);
    if (!selector) {
        return {
            allowed: false,
            message: `Role mapping file is invalid: ${roleMappingPath}.`,
        };
    }
    const normalizedApprover = approver.trim().toLowerCase();
    if (selector.githubUsers.length > 0) {
        const hasUserMatch = selector.githubUsers
            .map((value) => value.toLowerCase())
            .includes(normalizedApprover);
        if (hasUserMatch) {
            return { allowed: true };
        }
    }
    if (selector.repositoryRoles.length > 0) {
        const permission = await client.getRepositoryPermissionForUser(approver);
        const normalizedRoles = selector.repositoryRoles.map((value) => value.toLowerCase());
        const actualRole = permission.roleName?.toLowerCase() ?? "";
        const fallbackRole = permission.permission.toLowerCase();
        if (normalizedRoles.includes(actualRole) ||
            normalizedRoles.includes(fallbackRole)) {
            return { allowed: true };
        }
    }
    if (selector.githubTeams.length > 0) {
        for (const teamSlug of selector.githubTeams) {
            const membership = await client.getTeamMembershipForUser({
                org: repository.owner,
                teamSlug,
                username: approver,
            });
            if (membership?.state === "active") {
                return { allowed: true };
            }
        }
    }
    return { allowed: false };
}
function createGateGitHubClient({ apiBaseUrl, fetcher, owner, repo, token, }) {
    async function request(path, options = {}) {
        const response = await fetcher(`${apiBaseUrl.replace(/\/+$/, "")}${path}`, {
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${token}`,
                "X-GitHub-Api-Version": "2022-11-28",
            },
        });
        if (response.status === 404 && options.allowNotFound) {
            return null;
        }
        if (!response.ok) {
            throw new Error(`GitHub API request failed: ${response.status} ${await response.text()}`);
        }
        if (response.status === 204) {
            return null;
        }
        return (await response.json());
    }
    const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    return {
        async findExecutionRequestIssue(requestId) {
            for (let page = 1; page <= 5; page += 1) {
                const issues = await request(`${repoPath}/issues?state=all&per_page=100&page=${page}`);
                if (!issues?.length) {
                    return null;
                }
                const issue = issues.find((candidate) => {
                    if (candidate.pull_request) {
                        return false;
                    }
                    const request = parseExecutionRequestEvidence(candidate.body ?? "");
                    return request?.requestId === requestId;
                });
                if (issue) {
                    return {
                        body: issue.body ?? "",
                        number: issue.number,
                    };
                }
            }
            return null;
        },
        async listIssueComments(issueNumber) {
            const comments = [];
            for (let page = 1; page <= 5; page += 1) {
                const response = await request(`${repoPath}/issues/${issueNumber}/comments?per_page=100&page=${page}`);
                if (!response?.length) {
                    break;
                }
                comments.push(...response.map((comment) => ({
                    author: comment.user?.login?.trim() ?? "",
                    body: comment.body ?? "",
                    createdAt: comment.created_at ?? "",
                    updatedAt: comment.updated_at ?? "",
                })));
            }
            return comments;
        },
        async getFile(path, ref) {
            const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
            const response = await request(`${repoPath}/contents/${encodePath(path)}${query}`, { allowNotFound: true });
            if (!response) {
                return null;
            }
            if (response.encoding !== "base64" || !response.content) {
                throw new Error(`Unsupported GitHub file encoding for ${path}.`);
            }
            return {
                content: decodeBase64(response.content),
                path: response.path ?? path,
            };
        },
        async getRepositoryPermissionForUser(username) {
            const response = await request(`${repoPath}/collaborators/${encodeURIComponent(username)}/permission`, { allowNotFound: true });
            if (!response) {
                return {
                    permission: "none",
                    roleName: "none",
                    username,
                };
            }
            return {
                permission: normalizePermissionValue(response.permission) ??
                    normalizePermissionValue(response.role_name) ??
                    "none",
                roleName: normalizePermissionValue(response.role_name) ??
                    normalizePermissionValue(response.permission) ??
                    "none",
                username: response.user?.login?.trim() || username,
            };
        },
        async getTeamMembershipForUser({ org, teamSlug, username, }) {
            const response = await request(`/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/memberships/${encodeURIComponent(username)}`, { allowNotFound: true });
            if (!response) {
                return null;
            }
            return {
                role: response.role ?? "",
                state: response.state ?? "",
            };
        },
    };
}
function parseRepository(repository) {
    const [owner, repo] = repository.split("/");
    if (!owner || !repo) {
        throw new Error("GITHUB_REPOSITORY must be in owner/repo form.");
    }
    return { owner, repo };
}
function parseExecutionRequestEvidence(issueBody) {
    const marker = parseBatchPlaneMarker(issueBody, "execution-request");
    const requestId = marker.get("requestId") ?? readMarkdownField(issueBody, "Request ID");
    const batchId = marker.get("batchId") ?? readMarkdownField(issueBody, "Batch ID");
    const requestDigest = marker.get("requestDigest") ??
        readMarkdownField(issueBody, "Request digest");
    const status = marker.get("status") ?? readMarkdownField(issueBody, "Status");
    const payload = parseCanonicalPayload(issueBody);
    const workflow = readWorkflowTarget(payload);
    const requestedBy = readMarkdownField(issueBody, "Requested by").replace(/^@/, "") ||
        readRequestedBy(payload);
    const scheduleId = readScheduleId(payload);
    if (!requestId || !batchId || !requestDigest || !status) {
        return null;
    }
    return {
        batchId,
        ...(scheduleId ? { scheduleId } : {}),
        requestedBy,
        requestDigest,
        requestId,
        status,
        workflowPath: workflow.path,
        workflowRef: workflow.ref,
    };
}
function parseExecutionApprovalEvidence(comment) {
    const commentBody = comment.body;
    if (!commentBody.startsWith("/bgcp approve ")) {
        return null;
    }
    const command = parseApprovalCommand(commentBody);
    const marker = parseBatchPlaneMarker(commentBody, "execution-approval");
    const decision = marker.get("decision");
    const requestId = marker.get("requestId") ?? readMarkdownField(commentBody, "Request ID");
    const batchId = marker.get("batchId") ?? readMarkdownField(commentBody, "Batch ID");
    const requestDigest = marker.get("requestDigest") ??
        readMarkdownField(commentBody, "Request digest");
    if (decision !== "APPROVED" || !requestId || !batchId || !requestDigest) {
        return null;
    }
    return {
        approver: comment.author ||
            readMarkdownField(commentBody, "Approver").replace(/^@/, ""),
        batchId,
        commandDigest: command?.digest ?? null,
        edited: isEditedComment(comment),
        requestDigest,
        requestId,
    };
}
function parseBatchDefinitionSnapshot(content) {
    const parsed = parseYamlDocument(content);
    if (!parsed.ok) {
        return null;
    }
    const validated = validateBatchDefinitionFile(parsed.value);
    if (!validated.ok) {
        return null;
    }
    const value = validated.value;
    return {
        gateRequired: value.spec.gateRequired,
        status: value.spec.status,
        workflowPath: value.spec.workflow.path,
        workflowRef: value.spec.workflow.ref,
    };
}
function parseApproverSelectorFromRoleMappingFile(content) {
    const parsed = parseYamlDocument(content);
    if (!parsed.ok) {
        return null;
    }
    const validated = validateRoleMappingFile(parsed.value);
    if (!validated.ok) {
        return null;
    }
    const approver = validated.value.spec.roles.approver;
    return {
        githubTeams: approver.githubTeams ?? [],
        githubUsers: approver.githubUsers ?? [],
        repositoryRoles: approver.repositoryRoles ?? [],
    };
}
function parseCanonicalPayload(issueBody) {
    const match = issueBody.match(/```json\s*([\s\S]*?)```/);
    if (!match?.[1]) {
        return null;
    }
    try {
        return JSON.parse(match[1]);
    }
    catch {
        return null;
    }
}
function readWorkflowTarget(payload) {
    if (!payload || typeof payload !== "object") {
        return { path: "", ref: "" };
    }
    const spec = payload.spec;
    if (!spec || typeof spec !== "object") {
        return { path: "", ref: "" };
    }
    const workflow = spec.workflow;
    if (!workflow || typeof workflow !== "object") {
        return { path: "", ref: "" };
    }
    const path = workflow.path;
    const ref = workflow.ref;
    return {
        path: typeof path === "string" ? path : "",
        ref: typeof ref === "string" ? ref : "",
    };
}
function readRequestedBy(payload) {
    if (!payload || typeof payload !== "object") {
        return "";
    }
    const spec = payload.spec;
    if (!spec || typeof spec !== "object") {
        return "";
    }
    const requestedBy = spec.requestedBy;
    return typeof requestedBy === "string" ? requestedBy : "";
}
function readScheduleId(payload) {
    if (!payload || typeof payload !== "object") {
        return "";
    }
    const spec = payload.spec;
    if (!spec || typeof spec !== "object") {
        return "";
    }
    const schedule = spec.schedule;
    if (!schedule || typeof schedule !== "object") {
        return "";
    }
    const scheduleId = schedule.scheduleId;
    return typeof scheduleId === "string" ? scheduleId : "";
}
function parseApprovalCommand(body) {
    const firstLine = body.split("\n", 1)[0]?.trim();
    const match = firstLine?.match(/^\/bgcp approve\s+requestDigest=(\S+)$/u);
    if (!match?.[1]) {
        return null;
    }
    return { digest: match[1] };
}
function isEditedComment(comment) {
    if (!comment.createdAt || !comment.updatedAt) {
        return false;
    }
    return comment.createdAt !== comment.updatedAt;
}
function encodePath(path) {
    return path
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");
}
function decodeBase64(value) {
    return Buffer.from(value.replace(/\s/g, ""), "base64").toString("utf-8");
}
function normalizePermissionValue(value) {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) {
        return "";
    }
    return normalized;
}
function writeGateOutputs(result, env) {
    const outputPath = env.GITHUB_OUTPUT;
    if (!outputPath) {
        return;
    }
    appendFileSync(outputPath, [
        `result=${result.result}`,
        `reason_code=${result.reasonCode ?? ""}`,
        `message=${escapeOutputValue(result.message)}`,
    ].join("\n") + "\n", "utf8");
}
function writeGateSummary(result, input, env) {
    const summaryPath = env.GITHUB_STEP_SUMMARY;
    if (!summaryPath) {
        return;
    }
    const lines = [
        "## BatchPlane Gate Result",
        "",
        `- Result: ${result.result}`,
        `- Reason code: ${result.reasonCode ?? "N/A"}`,
        `- Message: ${result.message}`,
        `- Batch ID: ${input.batchId}`,
        `- Request ID: ${input.requestId ?? ""}`,
        `- Approval source: ${input.approvalSource ?? ""}`,
        `- Approval ref: ${input.approvalRef ?? ""}`,
    ];
    appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}
function escapeOutputValue(value) {
    return value.replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function parseBatchPlaneMarker(body, kind) {
    const marker = new Map();
    const match = body.match(new RegExp(`<!--\\s*batch(?:plane|trail):${kind}\\s*([\\s\\S]*?)-->`));
    if (!match?.[1]) {
        return marker;
    }
    for (const line of match[1].split("\n")) {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex < 0) {
            continue;
        }
        marker.set(line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim());
    }
    return marker;
}
function readMarkdownField(body, label) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = body.match(new RegExp(`- ${escapedLabel}:\\s*(.+)`));
    const value = match?.[1]?.trim() ?? "";
    return value.replace(/^`|`$/g, "").trim();
}
if (process.env.GITHUB_ACTIONS === "true" &&
    process.env.BATCHTRAIL_GATE_DISABLE_AUTO_RUN !== "true") {
    await runGateFromEnv();
}
