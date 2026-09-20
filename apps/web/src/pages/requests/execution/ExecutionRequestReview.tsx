import type { ExecutionRequestDraft } from "@batchplane/ui-client";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../components/Button";
import type { ExecutionRequestPreviewState } from "./useExecutionRequestPreview";
import type { ExecutionRequestSubmissionState } from "./useExecutionRequestSubmission";

export function ExecutionRequestReview({
  batch,
  canSubmit,
  previewState,
  submitState,
  workspaceApprovalMode,
}: {
  batch: ExecutionRequestDraft["batch"];
  canSubmit: boolean;
  previewState: ExecutionRequestPreviewState;
  submitState: ExecutionRequestSubmissionState;
  workspaceApprovalMode: ExecutionRequestDraft["workspaceApprovalMode"];
}) {
  const { t } = useTranslation("executionRequests");
  const previewRequest =
    previewState.type === "ready" ? previewState.preview.request : null;

  return (
    <aside className="min-w-0 space-y-4">
      <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-bp-graphite">
          {t("review.title")}
        </h2>
        <div className="mt-4 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t("review.gateRequired")}
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <ReviewFact
            label={t("review.workflow")}
            value={batch.executionTarget?.targetName ?? "-"}
          />
          <ReviewFact
            label={t("review.runner")}
            value={batch.executionTarget?.executionEnvironment ?? "-"}
          />
          <ReviewFact
            label={t("review.requestId")}
            value={previewRequest?.requestId ?? t("review.pending")}
          />
          <ReviewFact
            label={t("review.expiresAt")}
            value={previewRequest?.expiresAt ?? t("review.pending")}
          />
          <ReviewFact
            label={t("review.digest")}
            value={
              previewRequest?.evidence.requestDigest ?? t("review.pending")
            }
          />
        </dl>

        <ul className="mt-5 space-y-2 text-sm">
          <CheckItem
            ready={Boolean(batch.executionTarget?.command?.trim())}
            text={t("review.commandReady")}
          />
          <CheckItem
            ready={previewRequest !== null}
            text={t("review.digestReady")}
          />
          <CheckItem ready text={t("review.noDispatch")} />
        </ul>

        <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold text-bp-muted">
          {t("review.nextStep")}
        </p>
        {workspaceApprovalMode === "AUTO_APPROVE" ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            {t("review.autoApproval")}
          </p>
        ) : null}

        <Button
          className="mt-4 w-full justify-center py-3"
          disabled={!canSubmit}
          type="submit"
          variant="primary"
        >
          {submitState.type === "submitting" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          {t("actions.createRequest")}
        </Button>
      </article>

      <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-bp-graphite">
          {t("payload.title")}
        </h2>
        {previewState.type === "loading" ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-bp-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t("payload.loading")}
          </p>
        ) : null}
        {previewState.type === "error" ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
            {previewState.message || t("states.previewError")}
          </p>
        ) : null}
        {previewRequest?.evidence.canonicalPayload ? (
          <pre className="mt-4 max-h-96 max-w-full overflow-auto rounded-md bg-bp-graphite p-4 text-xs leading-6 text-white">
            <code>{previewRequest.evidence.canonicalPayload}</code>
          </pre>
        ) : null}
        {previewState.type === "idle" ? (
          <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
            {t("payload.idle")}
          </p>
        ) : null}
      </article>
    </aside>
  );
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs font-semibold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}

function CheckItem({ ready, text }: { ready: boolean; text: string }) {
  const Icon = ready ? CheckCircle2 : AlertCircle;
  return (
    <li
      className={`flex items-start gap-2 ${ready ? "text-bp-graphite" : "text-amber-800"}`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${ready ? "text-emerald-700" : "text-amber-700"}`}
        aria-hidden="true"
      />
      <span className="font-medium">{text}</span>
    </li>
  );
}
