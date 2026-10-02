import type { FailureFollowUpStatus } from "@batchplane/ui-client";
import { Save } from "lucide-react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/Button";
import { formatInspectionError } from "../../../../client/inspection-errors";

const followUpStatuses = [
  "OPEN",
  "INVESTIGATING",
  "RESOLVED",
  "ACCEPTED_RISK",
] as const satisfies readonly FailureFollowUpStatus[];

export function FailureFollowUpForm({
  actionTaken,
  canSubmit,
  error,
  explanation,
  owner,
  status,
  submitState,
  onActionTakenChange,
  onExplanationChange,
  onOwnerChange,
  onStatusChange,
  onSubmit,
}: {
  actionTaken: string;
  canSubmit: boolean;
  error: unknown;
  explanation: string;
  owner: string;
  status: FailureFollowUpStatus;
  submitState: "idle" | "submitting";
  onActionTakenChange: (value: string) => void;
  onExplanationChange: (value: string) => void;
  onOwnerChange: (value: string) => void;
  onStatusChange: (value: FailureFollowUpStatus) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const { t } = useTranslation("executionRequests");
  return (
    <form className="mt-4 grid gap-3 lg:grid-cols-2" onSubmit={onSubmit}>
      <label className="block text-sm font-semibold text-bp-graphite">
        {t("runDetail.followUp.owner")}
        <input
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          onChange={(event) => onOwnerChange(event.target.value)}
          placeholder={t("runDetail.followUp.ownerPlaceholder")}
          value={owner}
        />
      </label>
      <label className="block text-sm font-semibold text-bp-graphite">
        {t("runDetail.followUp.status")}
        <select
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          onChange={(event) =>
            onStatusChange(event.target.value as FailureFollowUpStatus)
          }
          value={status}
        >
          {followUpStatuses.map((option) => (
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
          onChange={(event) => onExplanationChange(event.target.value)}
          placeholder={t("runDetail.followUp.explanationPlaceholder")}
          value={explanation}
        />
      </label>
      <label className="block text-sm font-semibold text-bp-graphite">
        {t("runDetail.followUp.actionTaken")}
        <textarea
          className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          onChange={(event) => onActionTakenChange(event.target.value)}
          placeholder={t("runDetail.followUp.actionTakenPlaceholder")}
          value={actionTaken}
        />
      </label>
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 lg:col-span-2">
          {formatInspectionError(error, t, "runDetail.followUp.error")}
        </p>
      ) : null}
      <Button
        className="w-fit lg:col-span-2"
        size="compact"
        variant="primary"
        disabled={!canSubmit}
        type="submit"
      >
        <Save className="h-4 w-4" aria-hidden="true" />
        {submitState === "submitting"
          ? t("runDetail.followUp.saving")
          : t("runDetail.followUp.save")}
      </Button>
    </form>
  );
}
