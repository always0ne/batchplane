import type { RequestInventoryItem } from "@batchplane/ui-client";
import { ExternalLink, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ButtonLink } from "../../../components/ButtonLink";
import { changeRequestTypeLabel } from "../approval-display";
import { ApprovalMeta } from "./ApprovalMeta";

export function ChangeRequestApproval({
  item,
}: {
  item: Extract<RequestInventoryItem, { kind: "CHANGE_REQUEST" }>;
}) {
  const { t } = useTranslation("approvals");
  const request = item.request;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-bp-git" aria-hidden="true" />
            <h3 className="break-words text-lg font-semibold text-bp-graphite">
              {request.title}
            </h3>
          </div>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <ApprovalMeta
              label={t("fields.batchId")}
              value={request.batchId || t("values.unknown")}
            />
            <ApprovalMeta
              label={t("fields.author")}
              value={request.requester || t("values.unknown")}
            />
            <ApprovalMeta
              label={t("fields.requestType")}
              value={changeRequestTypeLabel(item.changeKind, t)}
            />
            <ApprovalMeta
              label={t("fields.repository")}
              value={request.workspaceLabel}
            />
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          {request.sourceUrl ? (
            <a
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-bp-graphite hover:border-bp-git"
              href={request.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t("actions.openSourceRequest")}
            </a>
          ) : null}
          <ButtonLink
            className="h-10 justify-center hover:bg-bp-graphite"
            size="compact"
            to={`/approvals/registration/${encodeURIComponent(request.requestLocator)}`}
            variant="primary"
          >
            {t("actions.viewRegistrationDetails")}
          </ButtonLink>
        </div>
      </div>
      <p className="mt-4 text-sm text-bp-muted">
        {t("states.registrationReviewHint")}
      </p>
    </article>
  );
}
