import type {
  ExecutionRunPresentation as ExecutionRun,
  FailureFollowUpReviewDecisionValue,
  FailureFollowUpStatus,
} from "@batchplane/ui-client";
import { AlertTriangle, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatInspectionError } from "../../client/inspection-errors";
import { FailureFollowUpItem } from "./FailureFollowUpItem";
const failureFollowUpStatuses = [
  "OPEN",
  "INVESTIGATING",
  "RESOLVED",
  "ACCEPTED_RISK",
] as const satisfies readonly FailureFollowUpStatus[];

export function FailureFollowUpPanel({
  onReview,
  onSubmit,
  run,
}: {
  onReview: (params: {
    decision: FailureFollowUpReviewDecisionValue;
    followUpId: string;
    reason: string;
  }) => Promise<void>;
  onSubmit: (params: {
    actionTaken: string;
    explanation: string;
    owner: string;
    status: FailureFollowUpStatus;
  }) => Promise<void>;
  run: ExecutionRun;
}) {
  const { t } = useTranslation("executionRequests");
  const [actionTaken, setActionTaken] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [explanation, setExplanation] = useState("");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState<FailureFollowUpStatus>("INVESTIGATING");
  const [submitState, setSubmitState] = useState<"idle" | "submitting">("idle");
  const followUps = run.failureFollowUps ?? [];
  const canSubmit =
    actionTaken.trim() !== "" &&
    explanation.trim() !== "" &&
    owner.trim() !== "" &&
    submitState !== "submitting";

  async function submitFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setError(null);
    setSubmitState("submitting");

    try {
      await onSubmit({
        actionTaken: actionTaken.trim(),
        explanation: explanation.trim(),
        owner: owner.trim(),
        status,
      });
      setActionTaken("");
      setExplanation("");
      setOwner("");
      setStatus("INVESTIGATING");
    } catch (error) {
      setError(error);
    } finally {
      setSubmitState("idle");
    }
  }

  return (
    <article
      className="rounded-lg border border-red-200 bg-white p-5 shadow-sm"
      id="failure-follow-up"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-red-700" aria-hidden="true" />
        <h2 className="text-base font-bold text-bp-graphite">
          {t("runDetail.followUp.title")}
        </h2>
      </div>
      <p className="mt-3 text-sm font-semibold text-bp-muted">
        {t("runDetail.followUp.description")}
      </p>

      <form
        className="mt-4 grid gap-3 lg:grid-cols-2"
        onSubmit={submitFollowUp}
      >
        <label className="block text-sm font-semibold text-bp-graphite">
          {t("runDetail.followUp.owner")}
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setOwner(event.target.value)}
            placeholder={t("runDetail.followUp.ownerPlaceholder")}
            value={owner}
          />
        </label>
        <label className="block text-sm font-semibold text-bp-graphite">
          {t("runDetail.followUp.status")}
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) =>
              setStatus(event.target.value as FailureFollowUpStatus)
            }
            value={status}
          >
            {failureFollowUpStatuses.map((option) => (
              <option key={option} value={option}>
                {t(`runDetail.followUp.statusValues.${option}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-bp-graphite">
          {t("runDetail.followUp.explanation")}
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setExplanation(event.target.value)}
            placeholder={t("runDetail.followUp.explanationPlaceholder")}
            value={explanation}
          />
        </label>
        <label className="block text-sm font-semibold text-bp-graphite">
          {t("runDetail.followUp.actionTaken")}
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setActionTaken(event.target.value)}
            placeholder={t("runDetail.followUp.actionTakenPlaceholder")}
            value={actionTaken}
          />
        </label>
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 lg:col-span-2">
            {formatInspectionError(error, t, "runDetail.followUp.error")}
          </p>
        ) : null}
        <button
          className="inline-flex w-fit items-center gap-2 rounded-md bg-bp-control px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 lg:col-span-2"
          disabled={!canSubmit}
          type="submit"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {submitState === "submitting"
            ? t("runDetail.followUp.saving")
            : t("runDetail.followUp.save")}
        </button>
      </form>

      <div className="mt-5">
        <h3 className="text-sm font-bold text-bp-graphite">
          {t("runDetail.followUp.history")}
        </h3>
        {followUps.length === 0 ? (
          <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
            {t("runDetail.followUp.empty")}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {followUps.map((followUp) => (
              <FailureFollowUpItem
                followUp={followUp}
                key={followUp.followUpId}
                onReview={onReview}
              />
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
