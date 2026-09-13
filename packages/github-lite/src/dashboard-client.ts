import type { BatchPlaneRuntimePorts } from "@batchplane/domain";
import {
  isBusinessFailure,
  type BatchPlaneClient,
} from "@batchplane/ui-client";
import { withInspectionErrorMapping } from "./execution-inspection-client.js";

export function createGitHubLiteDashboardClient({
  runtime,
  requests,
  inspections,
}: {
  runtime: Pick<BatchPlaneRuntimePorts, "settings" | "batches">;
  requests: Pick<BatchPlaneClient, "listApprovalRequests">;
  inspections: Pick<
    BatchPlaneClient,
    "listExecutionRuns" | "listAuditTimeline"
  >;
}): Pick<BatchPlaneClient, "getDashboardSummary"> {
  return {
    getDashboardSummary: () =>
      withInspectionErrorMapping(async () => {
        const [user, repository] = await Promise.all([
          runtime.settings.getCurrentUser(),
          runtime.settings.getRepository(),
        ]);
        const [installation, batches, approvals, runs, auditItems] =
          await Promise.all([
            runtime.settings.checkInstallationStatus({
              ref: repository.defaultBranch,
            }),
            runtime.batches.listBatchDefinitions({
              ref: repository.defaultBranch,
            }),
            requests.listApprovalRequests(),
            inspections.listExecutionRuns({ limit: 100 }),
            inspections.listAuditTimeline({ limit: 5 }),
          ]);
        return {
          workspace: {
            label: repository.owner + "/" + repository.repo,
            currentUser: user.login,
            defaultRevision: repository.defaultBranch,
          },
          installation: {
            installed: installation.installed,
            missingCount: installation.missingPaths.length,
            presentCount: installation.presentPaths.length,
            requiredCount: installation.requiredPaths.length,
          },
          batchCount: batches.length,
          pendingApprovals: approvals.requests,
          failedRunCount: runs.filter(isBusinessFailure).length,
          gateBlockedRunCount: runs.filter((run) => run.status === "BLOCKED")
            .length,
          auditItems,
        };
      }),
  };
}
