import type { ExecutionRequestDraft } from "@batchplane/ui-client";
import { type FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../../../components/PageHeader";
import { useExecutionRequestPreview } from "../hooks/useExecutionRequestPreview";
import { useExecutionRequestSubmission } from "../hooks/useExecutionRequestSubmission";
import {
  addHours,
  validateForm,
  type ExecutionRequestFormValues,
} from "../execution-request-form-values";
import { BatchRequestContext } from "./BatchRequestContext";
import { ExecutionRequestForm } from "./ExecutionRequestForm";
import { ExecutionRequestReview } from "./ExecutionRequestReview";

export function ExecutionRequestFormSession({
  draft,
}: {
  draft: ExecutionRequestDraft;
}) {
  const { t } = useTranslation("executionRequests");
  const navigate = useNavigate();
  const [formValues, setFormValues] = useState<ExecutionRequestFormValues>({
    expiresInHours: "1",
    parameters: [],
    reason: t("form.defaultReason"),
    targetRevision: draft.batch.executionTarget?.targetRevision ?? "",
  });
  const validationErrors = useMemo(
    () => [
      ...draft.creationCapability.unavailableReasons.map((reason) =>
        t(`validation.readiness.${reason}`),
      ),
      ...validateForm(formValues, t),
    ],
    [draft.creationCapability.unavailableReasons, formValues, t],
  );
  const input = useMemo(
    () => ({
      draft,
      expiresAt: addHours(draft.requestedAt, Number(formValues.expiresInHours)),
      parameters: formValues.parameters.map(({ name, sensitive, value }) => ({
        name,
        sensitive,
        value,
      })),
      reason: formValues.reason,
      targetRevision: formValues.targetRevision,
    }),
    [draft, formValues],
  );
  const previewState = useExecutionRequestPreview({
    input,
    isReady:
      draft.creationCapability.canCreate && validationErrors.length === 0,
  });
  const { state: submitState, submit } = useExecutionRequestSubmission(
    draft.requestId,
  );

  async function submitExecutionRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (previewState.type !== "ready") return;
    const result = await submit(input);
    if (!result) return;
    navigate(
      `/execution-requests/${encodeURIComponent(result.request.requestLocator)}`,
      {
        state: {
          createdExecutionRequest: result.request,
          ...(result.postCreateError
            ? {
                executionRequestPostCreateError: {
                  code: result.postCreateError.code,
                  requestDigest: result.request.evidence.requestDigest,
                  requestId: result.request.requestId,
                  requestLocator: result.request.requestLocator,
                },
              }
            : {}),
        },
      },
    );
  }

  const canSubmit =
    previewState.type === "ready" && submitState.type !== "submitting";

  return (
    <section>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { batchId: draft.batch.batchId })}
      />
      <form
        className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_28rem]"
        onSubmit={(event) => void submitExecutionRequest(event)}
      >
        <div className="min-w-0 space-y-4">
          <BatchRequestContext batch={draft.batch} />
          <ExecutionRequestForm
            formValues={formValues}
            onChange={setFormValues}
            submitState={submitState}
            validationErrors={validationErrors}
          />
        </div>
        <ExecutionRequestReview
          batch={draft.batch}
          canSubmit={canSubmit}
          previewState={previewState}
          submitState={submitState}
          workspaceApprovalMode={draft.workspaceApprovalMode}
        />
      </form>
    </section>
  );
}
