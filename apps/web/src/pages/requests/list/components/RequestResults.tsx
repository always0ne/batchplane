import type { RequestInventoryItem } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../../../components/EmptyState";
import { requestKey } from "../request-list-display";
import { WorkspaceRequestRow } from "./WorkspaceRequestRow";

export function RequestResults({ items }: { items: RequestInventoryItem[] }) {
  const { t } = useTranslation("requests");
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-bp-graphite">
          {t("list.title")}
        </h2>
        <p className="mt-1 text-sm text-bp-muted">
          {t("list.subtitle", { count: items.length })}
        </p>
      </div>
      {items.length === 0 ? (
        <div className="p-4">
          <EmptyState message={t("states.empty")} />
        </div>
      ) : (
        <ul className="divide-y divide-slate-200">
          {items.map((item) => (
            <WorkspaceRequestRow item={item} key={requestKey(item)} />
          ))}
        </ul>
      )}
    </section>
  );
}
