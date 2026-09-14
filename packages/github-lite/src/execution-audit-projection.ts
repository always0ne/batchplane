import type {
  AuditTimelineItem,
  FailureFollowUp,
  RepositoryIssueComment,
  RepositoryPullRequest,
} from "@batchplane/domain";
import type { ExecutionAuditItem } from "@batchplane/ui-client";
import type { ExecutionRunFacts } from "./execution-run-projection.js";
import type { ExecutionRequestForRun } from "./inspection-context.js";
import {
  deriveRegistrationReviewState,
  parseRegistrationApprovalDecision,
  parseRegistrationRequestSummary,
} from "./registration-approval-legacy.js";
export function toRegistrationAuditItems(
  pullRequest: RepositoryPullRequest,
  comments: RepositoryIssueComment[],
): AuditTimelineItem[] {
  if (!isRegistrationAuditPullRequest(pullRequest)) {
    return [];
  }

  const summary = parseRegistrationRequestSummary(pullRequest);
  const decision = parseRegistrationApprovalDecision(comments);
  const reviewState = deriveRegistrationReviewState(pullRequest, decision);
  const batchId = summary.batchId || pullRequest.title;
  const items: AuditTimelineItem[] = [
    {
      actor: pullRequest.author,
      itemId: `registration-pr-${pullRequest.number}`,
      occurredAt: pullRequest.createdAt ?? pullRequest.updatedAt ?? "",
      sourceUrl: pullRequest.url,
      subjectId: batchId,
      subjectType: "BATCH",
      summary: `Registration request #${pullRequest.number}: ${pullRequest.title}`,
      type: pullRequest.merged ? "BATCH_REGISTERED" : "BATCH_CHANGED",
      metadata: compactAuditMetadata({
        batchId,
        pullNumber: pullRequest.number,
        reviewState,
      }),
    },
  ];

  if (decision) {
    items.push({
      actor: decision.actor,
      itemId: `registration-pr-${pullRequest.number}-decision-${decision.commentId}`,
      occurredAt: decision.decidedAt,
      sourceUrl: pullRequest.url,
      subjectId: batchId,
      subjectType: "BATCH",
      summary: `Registration ${decision.decision.toLowerCase()} for ${batchId}`,
      type: "APPROVAL_RECORDED",
      metadata: compactAuditMetadata({
        batchId,
        decision: decision.decision,
        pullNumber: pullRequest.number,
        reviewState,
      }),
    });
  }

  return items;
}

export function isRegistrationAuditPullRequest(
  pullRequest: RepositoryPullRequest,
): boolean {
  return (
    pullRequest.head.startsWith("batchplane/register/") ||
    pullRequest.head.startsWith("batchtrail/register/") ||
    pullRequest.title.startsWith("Register batch ")
  );
}

export function toExecutionRequestAuditItems({
  failureFollowUps,
  request,
}: {
  failureFollowUps: FailureFollowUp[];
  request: ExecutionRequestForRun;
}): AuditTimelineItem[] {
  const items: AuditTimelineItem[] = [
    {
      actor: request.requestedBy,
      itemId: `execution-request-${request.requestId}`,
      occurredAt: request.requestedAt || request.issue.createdAt || "",
      sourceUrl: request.issue.url,
      subjectId: request.requestId,
      subjectType: "EXECUTION_REQUEST",
      summary:
        request.triggerType === "SCHEDULE"
          ? `Native schedule occurrence recorded for ${request.batchId}`
          : `Execution requested for ${request.batchId}`,
      type: "EXECUTION_REQUESTED",
      metadata: compactAuditMetadata({
        batchId: request.batchId,
        issueNumber: request.issue.number,
        requestId: request.requestId,
        status: request.status,
      }),
    },
  ];

  if (request.approvalDecision) {
    items.push({
      actor: request.approvalDecision.actor,
      itemId: `execution-request-${request.requestId}-approval`,
      occurredAt: request.approvalDecision.decidedAt,
      sourceUrl: request.issue.url,
      subjectId: request.requestId,
      subjectType: "EXECUTION_REQUEST",
      summary: `Execution ${request.approvalDecision.decision.toLowerCase()} for ${request.batchId}`,
      type: "APPROVAL_RECORDED",
      metadata: compactAuditMetadata({
        batchId: request.batchId,
        decision: request.approvalDecision.decision,
        issueNumber: request.issue.number,
        requestId: request.requestId,
      }),
    });
  }

  if (request.dispatcherStatus) {
    items.push({
      actor: request.dispatcherStatus.actor,
      itemId: `execution-request-${request.requestId}-dispatch-${request.dispatcherStatus.status}`,
      occurredAt: request.dispatcherStatus.createdAt,
      sourceUrl: request.issue.url,
      subjectId: request.requestId,
      subjectType: "EXECUTION_REQUEST",
      summary: `Dispatcher recorded ${request.dispatcherStatus.status.toLowerCase()} for ${request.batchId}`,
      type: "DISPATCH_RECORDED",
      metadata: compactAuditMetadata({
        batchId: request.batchId,
        issueNumber: request.issue.number,
        requestId: request.requestId,
        status: request.dispatcherStatus.status,
      }),
    });
  }

  if (request.gateDecision) {
    items.push({
      actor: request.gateDecision.actor,
      itemId: `execution-request-${request.requestId}-gate`,
      occurredAt: request.gateDecision.createdAt,
      sourceUrl: request.issue.url,
      subjectId: request.requestId,
      subjectType: "EXECUTION_REQUEST",
      summary: `Gate ${request.gateDecision.allowed ? "allowed" : "blocked"} ${request.batchId}`,
      type: "GATE_DECIDED",
      metadata: compactAuditMetadata({
        batchId: request.batchId,
        gateResult: request.gateDecision.allowed ? "ALLOWED" : "BLOCKED",
        issueNumber: request.issue.number,
        reasonCode: request.gateDecision.reasonCode,
        requestId: request.requestId,
      }),
    });
  }

  for (const followUp of failureFollowUps) {
    items.push({
      actor: followUp.author,
      itemId: `failure-follow-up-${followUp.followUpId}`,
      occurredAt: followUp.createdAt,
      sourceUrl: request.issue.url,
      subjectId: followUp.runId,
      subjectType: "EXECUTION_RUN",
      summary: `Failure follow-up recorded for ${followUp.batchId}`,
      type: "FAILURE_FOLLOW_UP_RECORDED",
      metadata: compactAuditMetadata({
        batchId: followUp.batchId,
        followUpId: followUp.followUpId,
        requestId: followUp.requestId,
        reviewStatus: followUp.reviewStatus,
        runId: followUp.runId,
        status: followUp.status,
      }),
    });

    for (const review of followUp.reviews) {
      items.push({
        actor: review.reviewer,
        itemId: `failure-follow-up-review-${review.reviewId}`,
        occurredAt: review.reviewedAt,
        sourceUrl: request.issue.url,
        subjectId: review.runId,
        subjectType: "EXECUTION_RUN",
        summary: `Failure follow-up ${review.decision.toLowerCase()} for ${review.batchId}`,
        type: "FAILURE_FOLLOW_UP_REVIEWED",
        metadata: compactAuditMetadata({
          approvalMode: review.approvalMode,
          batchId: review.batchId,
          decision: review.decision,
          followUpId: review.followUpId,
          requestId: review.requestId,
          reviewId: review.reviewId,
          runId: review.runId,
          selfReview: review.selfReview,
        }),
      });
    }
  }

  return items;
}

export function toInspectedRunAuditItem(
  run: ExecutionRunFacts,
): ExecutionAuditItem {
  const native = run.nativeSchedule;
  const sourceOnly = run.evidenceScope === "SOURCE_RUN";
  const observation = native?.observation ?? run.status;
  const execution =
    native || sourceOnly
      ? {
          locator: run.runId,
          runAttempt: run.runAttempt,
          observation,
          sourceOnly,
          ...(native ? { scheduleId: native.scheduleId } : {}),
        }
      : undefined;
  return {
    actor: run.actor ?? "",
    itemId: native
      ? `native-schedule-run-${run.runId}`
      : sourceOnly
        ? `source-run-${run.workflowRunId}-${run.runAttempt}`
        : `workflow-run-${run.workflowRunId}`,
    occurredAt: run.observedAt ?? run.completedAt ?? run.startedAt ?? "",
    sourceUrl: run.workflowRunUrl,
    subjectId: run.runId,
    subjectType: "EXECUTION_RUN",
    summary: native
      ? `Native schedule ${observation.toLowerCase()} for ${run.batchId}`
      : sourceOnly
        ? `Source run ${run.workflowRunId} attempt ${run.runAttempt}: unconfirmed`
        : `Workflow run ${run.sourceConclusion ?? run.sourceStatus} for ${run.batchId || run.workflowName}`,
    type: "RUN_COMPLETED",
    ...(execution ? { execution } : {}),
    metadata: compactAuditMetadata({
      batchId: run.batchId,
      requestId: run.requestId,
      runId: Number(run.workflowRunId),
      runAttempt: run.runAttempt,
      workflowPath: run.workflowPath,
      status: run.sourceStatus,
      conclusion: run.sourceConclusion,
      ...(execution
        ? {
            executionLocator: execution.locator,
            observation,
            scheduleId: native?.scheduleId,
          }
        : {}),
      ...(sourceOnly ? { evidenceScope: "SOURCE_RUN" } : {}),
    }),
  };
}

export function compactAuditMetadata(
  metadata: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(metadata).filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== undefined && entry[1] !== "",
    ),
  );
}

export function compareAuditItemsDesc(
  left: AuditTimelineItem,
  right: AuditTimelineItem,
): number {
  return auditTimestamp(right.occurredAt) - auditTimestamp(left.occurredAt);
}

export function auditTimestamp(value: string): number {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}
