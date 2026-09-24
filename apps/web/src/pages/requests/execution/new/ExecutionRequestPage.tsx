import type { ExecutionRequestDraft } from "@batchplane/ui-client";
import { type FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../../components/PageHeader";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../../../components/PageState";
import {
  ExecutionRequestForm,
  type ExecutionRequestFormValues,
} from "./ExecutionRequestForm";
import { ExecutionRequestReview } from "./ExecutionRequestReview";
import { useExecutionRequestDraft } from "./useExecutionRequestDraft";
import { useExecutionRequestPreview } from "./useExecutionRequestPreview";
import { useExecutionRequestSubmission } from "./useExecutionRequestSubmission";

export function ExecutionRequestPage() {
  const { batchId = "" } = useParams();
  const decodedBatchId = decodeURIComponent(batchId);
  const { t } = useTranslation("executionRequests");
  const draftState = useExecutionRequestDraft(decodedBatchId);

  if (draftState.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
  }

  if (draftState.type === "workspace-not-connected") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-bp-control underline"
            to="/workspace"
          >
            {t("actions.openSetup")}
          </Link>
        }
        message={t("states.noSession")}
      />
    );
  }

  if (draftState.type === "not-found") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-bp-control underline"
            to="/batches"
          >
            {t("actions.backToBatches")}
          </Link>
        }
        message={t("states.notFound", { batchId: decodedBatchId })}
      />
    );
  }

  if (draftState.type === "error") {
    return <ErrorState message={draftState.message || t("states.error")} />;
  }

  return (
    <ExecutionRequestFormSession
      key={draftState.draft.requestId}
      draft={draftState.draft}
    />
  );
}

function ExecutionRequestFormSession({
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

function BatchRequestContext({
  batch,
}: {
  batch: ExecutionRequestDraft["batch"];
}) {
  const { t } = useTranslation("executionRequests");

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-bp-graphite">
            {batch.name}
          </h2>
          <p className="mt-1 break-all font-mono text-sm text-bp-muted">
            {batch.batchId}
          </p>
        </div>
        <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">
          {t("context.controlled")}
        </span>
      </div>

      <dl className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Fact label={t("context.owner")} value={batch.owner} />
        <Fact label={t("context.domain")} value={batch.domain} />
        <Fact label={t("context.environment")} value={batch.environment} />
        <Fact
          label={t("context.workflowPath")}
          value={batch.executionTarget?.targetName ?? "-"}
        />
        <Fact
          label={t("context.runsOn")}
          value={batch.executionTarget?.executionEnvironment ?? "-"}
        />
        <Fact
          label={t("context.command")}
          value={batch.executionTarget?.command || t("context.missingCommand")}
        />
      </dl>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}

function validateForm(
  values: ExecutionRequestFormValues,
  t: (key: string) => string,
): string[] {
  const errors: string[] = [];

  if (!values.targetRevision.trim()) {
    errors.push(t("validation.targetRevision"));
  }

  if (!values.reason.trim()) {
    errors.push(t("validation.reason"));
  }

  if (
    !Number.isFinite(Number(values.expiresInHours)) ||
    Number(values.expiresInHours) <= 0
  ) {
    errors.push(t("validation.expiresIn"));
  }

  values.parameters.forEach((parameter) => {
    if (!parameter.name.trim() && parameter.value.trim()) {
      errors.push(t("validation.parameterName"));
    }
  });

  return errors;
}

function addHours(requestedAt: string, hours: number): string {
  const requestedAtTime = new Date(requestedAt).getTime();
  return new Date(requestedAtTime + hours * 60 * 60 * 1000).toISOString();
}
