import type {
  ExecutionRunPresentation as ExecutionRun,
  FailureFollowUpReviewDecisionValue,
  FailureFollowUpStatus,
} from "@batchplane/ui-client";
import { AlertTriangle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { FailureFollowUpForm } from "./FailureFollowUpForm";
import { FailureFollowUpHistory } from "./FailureFollowUpHistory";

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

      <FailureFollowUpForm
        actionTaken={actionTaken}
        canSubmit={canSubmit}
        error={error}
        explanation={explanation}
        owner={owner}
        status={status}
        submitState={submitState}
        onActionTakenChange={setActionTaken}
        onExplanationChange={setExplanation}
        onOwnerChange={setOwner}
        onStatusChange={setStatus}
        onSubmit={submitFollowUp}
      />
      <FailureFollowUpHistory followUps={followUps} onReview={onReview} />
    </article>
  );
}
