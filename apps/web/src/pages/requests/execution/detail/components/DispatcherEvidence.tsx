import type { ExecutionAttempt, ExecutionRequest } from "@batchplane/ui-client";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";

import { formatGateReasonDisplay } from "../../../../../i18n/display-keys";
import { Fact } from "./Fact";

export function DispatcherEvidence({
  attempt,
  request,
}: {
  attempt: ExecutionAttempt | null;
  request: ExecutionRequest;
}) {
  const { t } = useTranslation("executionRequests");
  const scheduled = request.triggerType === "SCHEDULE";
  let gateEvidence = "";
  if (request.gateDecision) {
    const gateResult = request.gateDecision.allowed
      ? t("detail.dispatcher.gateAllowed")
      : t("detail.dispatcher.gateBlocked");
    const gateReason = formatGateReasonDisplay(
      request.gateDecision.reasonCode,
      t,
      t("detail.dispatcher.none"),
    );
    gateEvidence = `${gateResult} ${gateReason}`;
  }

  let approvalEvidence = t("detail.dispatcher.none");
  if (request.approvalDecision) {
    const { actor, decision, reason } = request.approvalDecision;
    approvalEvidence = `${decision} by @${actor}${reason ? `: ${reason}` : ""}`;
    if (request.approvalDecision.currentAuthorization === "DENIED")
      approvalEvidence += ` (${t("detail.values.decisionAuthorityDenied")})`;
    if (request.approvalDecision.currentAuthorization === "UNAVAILABLE")
      approvalEvidence += ` (${t("detail.values.authorizationUnavailable")})`;
  }

  let workflowRunEvidence = t("detail.dispatcher.noWorkflowRun");
  if (request.attempts.type === "unavailable") {
    workflowRunEvidence = t("detail.dispatcher.workflowRunUnavailable");
  }
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t(
          scheduled
            ? "detail.dispatcher.nativeScheduleTitle"
            : "detail.dispatcher.title",
        )}
      </h2>
      <p className="mt-2 text-sm text-bp-muted">
        {t(
          scheduled
            ? "detail.dispatcher.nativeScheduleEvidence"
            : "detail.dispatcher.noBrowserDispatch",
        )}
      </p>
      <dl className="mt-4 grid min-w-0 gap-3 text-sm">
        <Fact
          label={t("detail.dispatcher.status")}
          value={
            request.triggerType === "SCHEDULE"
              ? t("detail.status.SCHEDULE_RECORDED")
              : t(`detail.status.${request.status}`)
          }
        />
        {!scheduled ? (
          <>
            <Fact
              label={t("detail.dispatcher.dispatcherEvidence")}
              value={
                request.dispatcher
                  ? `${request.dispatcher.status} @ ${request.dispatcher.createdAt}`
                  : t("detail.dispatcher.none")
              }
            />
            <Fact
              label={t("detail.dispatcher.approvalEvidence")}
              value={approvalEvidence}
            />
          </>
        ) : null}
        {gateEvidence ? (
          <Fact
            label={t("detail.dispatcher.gateEvidence")}
            value={gateEvidence}
          />
        ) : null}
        <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
            {t("detail.dispatcher.workflowRun")}
          </dt>
          <dd className="mt-1 min-w-0 break-words text-xs font-semibold text-bp-graphite">
            {attempt ? (
              <Link
                className="break-all font-mono text-bp-control underline"
                to={`/executions/${encodeURIComponent(attempt.attemptLocator)}`}
              >
                {attempt.sourceLabel} {t(`runDetail.status.${attempt.status}`)}
              </Link>
            ) : (
              workflowRunEvidence
            )}
          </dd>
        </div>
      </dl>
      {!scheduled ? (
        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold text-bp-muted">
          {t(`detail.statusHelp.${request.status}`)}
        </p>
      ) : null}
    </article>
  );
}
