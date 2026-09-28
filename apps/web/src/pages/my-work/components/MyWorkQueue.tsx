import { useTranslation } from "react-i18next";
import { EmptyState } from "../../../components/EmptyState";
import type { WorkKind, WorkRow } from "../work-rows";
import { MyWorkListItem } from "./MyWorkListItem";

export function MyWorkQueue({
  currentUser,
  items,
  kindFilter,
  onShowAll,
}: {
  currentUser: string;
  items: WorkRow[];
  kindFilter: WorkKind | "all";
  onShowAll: () => void;
}) {
  const { t } = useTranslation("myWork");
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h2 className="text-lg font-semibold text-bp-graphite">
            {t("queue.title")}
          </h2>
          <p className="mt-1 text-sm text-bp-muted">
            {t("queue.subtitle", { login: currentUser })}
          </p>
        </div>
        {kindFilter !== "all" ? (
          <button
            className="text-sm font-semibold text-bp-control underline"
            onClick={() => onShowAll()}
            type="button"
          >
            {t("actions.showAll")}
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="p-4">
          <EmptyState message={t("states.empty")} />
        </div>
      ) : (
        <ul className="divide-y divide-slate-200">
          {items.map((item) => (
            <MyWorkListItem item={item} key={item.itemId} />
          ))}
        </ul>
      )}
    </section>
  );
}
