import type {
  BatchPlaneRuntimePorts,
  RepositoryPullRequest,
} from "@batchplane/domain";

import {
  buildRegistrationApprovalComment,
  isAutoApprovalEnabled,
} from "./approval-model";

export type GovernedChangeAutoApprovalResult =
  | { type: "not-enabled" }
  | {
      actor: string;
      pullNumber: number;
      type: "approved";
    };

export async function approveGovernedChangeIfAutoApprovalEnabled({
  defaultBranch,
  pullRequest,
  runtime,
}: {
  defaultBranch: string;
  pullRequest: RepositoryPullRequest;
  runtime: BatchPlaneRuntimePorts;
}): Promise<GovernedChangeAutoApprovalResult> {
  const [workspacePolicy, user] = await Promise.all([
    runtime.settings.getWorkspacePolicy({ ref: defaultBranch }),
    runtime.settings.getCurrentUser(),
  ]);

  if (!isAutoApprovalEnabled(workspacePolicy)) {
    return { type: "not-enabled" };
  }

  const mergeResult = await runtime.approvals.approveRegistration({
    body: buildRegistrationApprovalComment({
      approvalMode: workspacePolicy.approval.mode,
      approvalType: "WORKSPACE_AUTO_APPROVED",
      approvedAt: new Date(),
      approver: user.login,
      pullRequest,
    }),
    commitTitle: `${pullRequest.title} (#${pullRequest.number})`,
    pullNumber: pullRequest.number,
  });

  if (!mergeResult.merged) {
    throw new Error(mergeResult.message);
  }

  return {
    actor: user.login,
    pullNumber: pullRequest.number,
    type: "approved",
  };
}
