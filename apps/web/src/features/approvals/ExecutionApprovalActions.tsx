import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function ExecutionApprovalActions({
  approveDisabledReason = "",
  approveLabel,
  disabled,
  isApproving,
  isRejecting,
  onApprove,
  onReject,
  rejectLabel,
}: {
  approveDisabledReason?: string;
  approveLabel: string;
  disabled: boolean;
  isApproving: boolean;
  isRejecting: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
  rejectLabel: string;
}) {
  const { t } = useTranslation("approvals");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const approveDisabled = disabled || Boolean(approveDisabledReason);
  const rejectDisabled = disabled || rejectReason.trim().length === 0;

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-md bg-bp-control px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={approveDisabled}
          onClick={onApprove}
          title={approveDisabledReason || undefined}
          type="button"
        >
          {isApproving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          )}
          {approveLabel}
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:text-slate-400"
          disabled={disabled}
          onClick={() => setRejectOpen((current) => !current)}
          type="button"
        >
          {isRejecting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <XCircle className="h-4 w-4" aria-hidden="true" />
          )}
          {rejectLabel}
        </button>
      </div>

      {approveDisabledReason ? (
        <p className="text-sm font-semibold text-amber-800">
          {approveDisabledReason}
        </p>
      ) : null}

      {rejectOpen ? (
        <div className="rounded-md border border-red-100 bg-red-50 p-3">
          <label className="block text-sm font-semibold text-red-900">
            {t("actions.rejectReason")}
            <textarea
              className="mt-2 min-h-20 w-full resize-y rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-bp-graphite outline-none focus:border-red-400 focus:ring-2 focus:ring-red-200"
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder={t("actions.rejectReasonPlaceholder")}
              value={rejectReason}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={rejectDisabled}
              onClick={() => onReject(rejectReason.trim())}
              type="button"
            >
              {isRejecting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <XCircle className="h-4 w-4" aria-hidden="true" />
              )}
              {t("actions.confirmReject")}
            </button>
            <button
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
              onClick={() => {
                setRejectOpen(false);
                setRejectReason("");
              }}
              type="button"
            >
              {t("actions.cancelReject")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
