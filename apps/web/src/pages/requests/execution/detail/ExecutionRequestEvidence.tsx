import type { ExecutionAttempt, ExecutionRequest } from "@batchplane/ui-client";
import { CheckCircle2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { formatGateReasonDisplay } from "../../../../i18n/display-keys";

export function ExecutionRequestEvidence({
  attempt,
  request,
}: {
  attempt: ExecutionAttempt | null;
  request: ExecutionRequest;
}) {
  return (
    <>
      <GovernanceChecks request={request} />
      <DispatcherEvidence attempt={attempt} request={request} />
    </>
  );
}

function GovernanceChecks({ request }: { request: ExecutionRequest }) {
  const { t } = useTranslation("executionRequests");
  const gateRequired = request.batch.gateRequired === true;
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("detail.governance.title")}
      </h2>
      <ul className="mt-4 space-y-2 text-sm">
        <CheckRow
          ok={gateRequired}
          text={
            gateRequired
              ? t("detail.governance.gateRequired")
              : t("detail.governance.gateMissing")
          }
        />
        <CheckRow
          ok={Boolean(request.evidence.requestDigest)}
          text={t("detail.governance.digest")}
        />
        <CheckRow
          ok={request.requestedBy !== ""}
          text={t("detail.governance.requester")}
        />
      </ul>
    </article>
  );
}

function DispatcherEvidence({
  attempt,
  request,
}: {
  attempt: ExecutionAttempt | null;
  request: ExecutionRequest;
}) {
  const { t } = useTranslation("executionRequests");
  const scheduled = request.triggerType === "SCHEDULE";
  const gateEvidence = request.gateDecision
    ? `${request.gateDecision.allowed ? t("detail.dispatcher.gateAllowed") : t("detail.dispatcher.gateBlocked")} ${formatGateReasonDisplay(request.gateDecision.reasonCode, t, t("detail.dispatcher.none"))}`
    : "";
  const approvalEvidence = request.approvalDecision
    ? `${request.approvalDecision.decision} by @${request.approvalDecision.actor}${request.approvalDecision.reason ? `: ${request.approvalDecision.reason}` : ""}`
    : t("detail.dispatcher.none");
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
            ) : request.attempts.type === "unavailable" ? (
              t("detail.dispatcher.workflowRunUnavailable")
            ) : (
              t("detail.dispatcher.noWorkflowRun")
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
        {label}
      </dt>
      <dd className="mt-1 break-all font-mono text-xs font-semibold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}

function CheckRow({ ok, text }: { ok: boolean; text: string }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <li
      className={`flex min-w-0 items-start gap-2 ${ok ? "text-bp-graphite" : "text-red-800"}`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${ok ? "text-emerald-700" : "text-red-700"}`}
        aria-hidden="true"
      />
      <span className="break-words font-semibold">{text}</span>
    </li>
  );
}
