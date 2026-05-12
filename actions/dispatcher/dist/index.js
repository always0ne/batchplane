export function parseDispatcherCommand(commentBody) {
    if (commentBody.startsWith("/bgcp approve ")) {
        return "approve";
    }
    if (commentBody.startsWith("/bgcp retry-dispatch ")) {
        return "retry-dispatch";
    }
    return "ignore";
}
export async function dispatchApprovedExecutionRequest({ apiBaseUrl = "https://api.github.com", commentId, fetcher = fetch, githubToken, issueNumber, now = new Date(), owner, repo, }) {
    const client = createDispatcherGitHubClient({
        apiBaseUrl,
        fetcher,
        owner,
        repo,
        token: githubToken,
    });
    const [issue, approvalComment] = await Promise.all([
        client.getIssue(issueNumber),
        client.getIssueComment(commentId),
    ]);
    const command = parseDispatcherCommand(approvalComment.body);
    if (command === "ignore") {
        return {
            message: "Comment is not a BatchTrail dispatcher command.",
            reasonCode: "IGNORED_COMMENT",
            status: "ignored",
        };
    }
    const verification = verifyDispatcherEvidence({
        approvalCommentBody: approvalComment.body,
        issueBody: issue.body,
        now,
    });
    if (!verification.ok) {
        await client.createIssueComment(issueNumber, buildDispatchFailureComment(verification.message, verification.reasonCode));
        return {
            message: verification.message,
            reasonCode: verification.reasonCode,
            status: "failed",
        };
    }
    await client.dispatchWorkflow(verification.dispatchPlan);
    await client.createIssueComment(issueNumber, buildDispatchSuccessComment(verification.dispatchPlan));
    return {
        dispatchPlan: verification.dispatchPlan,
        status: "dispatched",
    };
}
export function verifyDispatcherEvidence({ approvalCommentBody, issueBody, now = new Date(), }) {
    const request = parseExecutionRequestEvidence(issueBody);
    if (!request) {
        return {
            ok: false,
            message: "BatchTrail execution request evidence was not found.",
            reasonCode: "REQUEST_NOT_FOUND",
        };
    }
    if (request.status !== "REQUESTED") {
        return {
            ok: false,
            message: `Execution request status is ${request.status}.`,
            reasonCode: "REQUEST_NOT_REQUESTED",
        };
    }
    if (isExpired(request.expiresAt, now)) {
        return {
            ok: false,
            message: "Execution request approval window has expired.",
            reasonCode: "EXPIRED_REQUEST",
        };
    }
    if (!request.workflowPath || !request.workflowRef) {
        return {
            ok: false,
            message: "Execution request workflow target was not found.",
            reasonCode: "WORKFLOW_NOT_FOUND",
        };
    }
    const approval = parseExecutionApprovalEvidence(approvalCommentBody);
    if (!approval) {
        return {
            ok: false,
            message: "BatchTrail execution approval evidence was not found.",
            reasonCode: "APPROVAL_NOT_FOUND",
        };
    }
    if (approval.decision !== "APPROVED") {
        return {
            ok: false,
            message: `Execution approval decision is ${approval.decision}.`,
            reasonCode: "APPROVAL_NOT_APPROVED",
        };
    }
    if (approval.requestId !== request.requestId ||
        approval.batchId !== request.batchId) {
        return {
            ok: false,
            message: "Execution approval does not reference the requested batch.",
            reasonCode: "REQUEST_FIELD_MISMATCH",
        };
    }
    if (approval.requestDigest !== request.requestDigest) {
        return {
            ok: false,
            message: "Execution approval digest does not match the request digest.",
            reasonCode: "DIGEST_MISMATCH",
        };
    }
    return {
        ok: true,
        approval,
        dispatchPlan: {
            batchId: request.batchId,
            requestDigest: request.requestDigest,
            requestId: request.requestId,
            workflowInputs: {
                batch_id: request.batchId,
                request_digest: request.requestDigest,
                request_id: request.requestId,
            },
            workflowPath: request.workflowPath,
            workflowRef: request.workflowRef,
        },
        request,
    };
}
export function parseExecutionRequestEvidence(issueBody) {
    const marker = parseBatchTrailMarker(issueBody, "execution-request");
    const requestId = marker.get("requestId") ?? readMarkdownField(issueBody, "Request ID");
    const batchId = marker.get("batchId") ?? readMarkdownField(issueBody, "Batch ID");
    const requestDigest = marker.get("requestDigest") ??
        readMarkdownField(issueBody, "Request digest");
    const status = marker.get("status") ?? readMarkdownField(issueBody, "Status");
    const payload = parseCanonicalPayload(issueBody);
    const workflow = readWorkflowTarget(payload);
    if (!requestId || !batchId || !requestDigest || !status) {
        return null;
    }
    return {
        batchId,
        expiresAt: readMarkdownField(issueBody, "Expires at"),
        requestDigest,
        requestedAt: readMarkdownField(issueBody, "Requested at"),
        requestedBy: readMarkdownField(issueBody, "Requested by").replace(/^@/, ""),
        requestId,
        status,
        workflowPath: workflow.path,
        workflowRef: workflow.ref,
    };
}
export function parseExecutionApprovalEvidence(commentBody) {
    const marker = parseBatchTrailMarker(commentBody, "execution-approval");
    const decision = marker.get("decision");
    const requestId = marker.get("requestId") ?? readMarkdownField(commentBody, "Request ID");
    const batchId = marker.get("batchId") ?? readMarkdownField(commentBody, "Batch ID");
    const requestDigest = marker.get("requestDigest") ??
        readMarkdownField(commentBody, "Request digest");
    if ((decision !== "APPROVED" && decision !== "REJECTED") ||
        !requestId ||
        !batchId ||
        !requestDigest) {
        return null;
    }
    return {
        batchId,
        decision,
        requestDigest,
        requestId,
    };
}
function parseBatchTrailMarker(body, kind) {
    const marker = new Map();
    const match = body.match(new RegExp(`<!--\\s*batchtrail:${kind}\\s*([\\s\\S]*?)-->`));
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
function readMarkdownField(body, label) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = body.match(new RegExp(`- ${escapedLabel}:\\s*(.+)`));
    const value = match?.[1]?.trim() ?? "";
    return value.replace(/^`|`$/g, "").trim();
}
function isExpired(expiresAt, now) {
    const expiresAtTime = Date.parse(expiresAt);
    if (Number.isNaN(expiresAtTime)) {
        return false;
    }
    return expiresAtTime <= now.getTime();
}
function createDispatcherGitHubClient({ apiBaseUrl, fetcher, owner, repo, token, }) {
    async function request(path, init = {}) {
        const response = await fetcher(`${apiBaseUrl}${path}`, {
            ...init,
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
                ...init.headers,
            },
        });
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
        async createIssueComment(issueNumber, body) {
            await request(`${repoPath}/issues/${issueNumber}/comments`, {
                body: JSON.stringify({ body }),
                method: "POST",
            });
        },
        async dispatchWorkflow(dispatchPlan) {
            await request(`${repoPath}/actions/workflows/${encodeURIComponent(getWorkflowId(dispatchPlan.workflowPath))}/dispatches`, {
                body: JSON.stringify({
                    inputs: dispatchPlan.workflowInputs,
                    ref: dispatchPlan.workflowRef,
                }),
                method: "POST",
            });
        },
        async getIssue(issueNumber) {
            const issue = await request(`${repoPath}/issues/${issueNumber}`);
            return { body: issue?.body ?? "" };
        },
        async getIssueComment(commentId) {
            const comment = await request(`${repoPath}/issues/comments/${commentId}`);
            return { body: comment?.body ?? "" };
        },
    };
}
function getWorkflowId(workflowPath) {
    return workflowPath.replace(/^\.github\/workflows\//, "");
}
function buildDispatchSuccessComment(dispatchPlan) {
    return [
        "## BatchTrail Dispatch",
        "",
        "- Status: DISPATCHED",
        `- Request ID: \`${dispatchPlan.requestId}\``,
        `- Batch ID: \`${dispatchPlan.batchId}\``,
        `- Workflow: \`${dispatchPlan.workflowPath}\``,
        `- Workflow ref: \`${dispatchPlan.workflowRef}\``,
        `- Request digest: \`${dispatchPlan.requestDigest}\``,
        "",
        "<!-- batchtrail:execution-dispatch",
        "status=DISPATCHED",
        `requestId=${dispatchPlan.requestId}`,
        `batchId=${dispatchPlan.batchId}`,
        `requestDigest=${dispatchPlan.requestDigest}`,
        "-->",
    ].join("\n");
}
function buildDispatchFailureComment(message, reasonCode) {
    return [
        "## BatchTrail Dispatch",
        "",
        "- Status: DISPATCH_FAILED",
        `- Reason code: ${reasonCode}`,
        `- Message: ${message}`,
        "",
        "<!-- batchtrail:execution-dispatch",
        "status=DISPATCH_FAILED",
        `reasonCode=${reasonCode}`,
        "-->",
    ].join("\n");
}
async function runDispatcherFromEnv() {
    const repository = getEnv("GITHUB_REPOSITORY");
    const [owner, repo] = repository.split("/");
    if (!owner || !repo) {
        throw new Error("GITHUB_REPOSITORY must be in owner/repo form.");
    }
    const result = await dispatchApprovedExecutionRequest({
        apiBaseUrl: process.env["GITHUB_API_URL"],
        commentId: parseRequiredNumberInput("comment-id"),
        githubToken: getInput("github-token"),
        issueNumber: parseRequiredNumberInput("issue-number"),
        owner,
        repo,
    });
    if (result.status === "failed") {
        throw new Error(`${result.reasonCode}: ${result.message}`);
    }
}
function parseRequiredNumberInput(name) {
    const value = Number.parseInt(getInput(name), 10);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Input ${name} must be a positive integer.`);
    }
    return value;
}
function getInput(name) {
    const key = `INPUT_${name.toUpperCase()}`;
    const normalizedKey = key.replaceAll("-", "_");
    const value = process.env[key] ?? process.env[normalizedKey] ?? "";
    if (!value.trim()) {
        throw new Error(`Input ${name} is required.`);
    }
    return value.trim();
}
function getEnv(name) {
    const value = process.env[name];
    if (!value?.trim()) {
        throw new Error(`${name} is required.`);
    }
    return value.trim();
}
if (process.env["GITHUB_ACTIONS"] === "true" &&
    process.env["BATCHTRAIL_DISPATCHER_DISABLE_AUTO_RUN"] !== "true") {
    void runDispatcherFromEnv().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
