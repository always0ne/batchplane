import type { RequestInventoryItem } from "@batchplane/ui-client";
import { ExternalLink, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ButtonLink } from "../../../../components/ButtonLink";
import {
  detailRoute,
  formatRequestTime,
  requestStatus,
  requestTypeLabel,
  statusClassName,
  statusLabel,
} from "../request-list-display";
import { RequestFact } from "./RequestFact";

export function WorkspaceRequestRow({ item }: { item: RequestInventoryItem }) {
  const { t } = useTranslation("requests");
  const request = item.request;
  const sourceUrl = request.sourceUrl;

  return (
    <li className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_11rem_10rem_9rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-bp-muted">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {requestTypeLabel(item, t)}
          </span>
          <span className={statusClassName(requestStatus(item))}>
            {statusLabel(requestStatus(item), t)}
          </span>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-bp-graphite">
            {request.sourceLabel}
          </span>
        </div>
        <p className="mt-2 break-words text-sm font-bold text-bp-graphite">
          {item.title}
        </p>
        <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          <RequestFact
            label={t("fields.target")}
            value={item.targetLabel || t("values.unknown")}
          />
          <RequestFact
            label={t("fields.actor")}
            value={item.actor || t("values.unknown")}
          />
        </dl>
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-bp-muted">
          {t("fields.updated")}
        </p>
        <p className="mt-1 text-sm font-semibold text-bp-graphite">
          {formatRequestTime(item.updatedAt, t("values.unknownTime"))}
        </p>
      </div>
      <ButtonLink
        className="h-10 justify-center hover:bg-bp-graphite"
        size="compact"
        to={detailRoute(item)}
        variant="primary"
      >
        {t("actions.openDetail")}
      </ButtonLink>
      {sourceUrl ? (
        <a
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-bp-graphite hover:border-bp-git"
          href={sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {t("actions.openSource")}
        </a>
      ) : null}
    </li>
  );
}
