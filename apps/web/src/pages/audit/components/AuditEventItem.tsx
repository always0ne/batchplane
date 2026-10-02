import type { TFunction } from "i18next";
import type { ExecutionAuditItem as AuditTimelineItem } from "@batchplane/ui-client";
import { ExternalLink, History } from "lucide-react";
import { ButtonLink } from "../../../components/ButtonLink";
import { formatAuditSummary } from "../audit-summary";
import { formatAuditEventType, formatAuditTime } from "../audit-display";
import { AuditMetadata } from "./AuditMetadata";

export function AuditEventItem({
  item,
  translate,
}: {
  item: AuditTimelineItem;
  translate: TFunction;
}) {
  const title = formatAuditEventType(item, translate);

  return (
    <li className="grid gap-3 p-4 md:grid-cols-[10rem_minmax(0,1fr)_auto]">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 rounded-md bg-slate-100 p-1.5 text-bp-git">
          <History className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-bold text-bp-graphite">{title}</p>
          <p className="mt-1 text-xs font-semibold text-bp-muted">
            {formatAuditTime(
              item.occurredAt,
              translate("audit:values.unknownTime"),
            )}
          </p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold text-bp-graphite">
          {formatAuditSummary(item, translate)}
        </p>
        <p className="mt-1 break-words text-xs font-semibold text-bp-muted">
          {translate("audit:values.actor", {
            actor: item.actor || translate("audit:values.unknownActor"),
          })}
        </p>
        <AuditMetadata item={item} />
      </div>
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        {item.execution ? (
          <ButtonLink
            className="h-10 justify-center hover:border-bp-git"
            size="compact"
            to={`/executions/${encodeURIComponent(item.execution.locator)}${item.execution.sourceOnly ? `?runAttempt=${item.execution.runAttempt}` : ""}`}
          >
            {translate("audit:actions.openExecution")}
          </ButtonLink>
        ) : null}
        {item.sourceUrl ? (
          <a
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-bp-graphite hover:border-bp-git"
            href={item.sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {translate("audit:actions.openSource")}
          </a>
        ) : null}
      </div>
    </li>
  );
}
