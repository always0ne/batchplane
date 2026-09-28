import type { BatchSchedule } from "@batchplane/domain";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../../../components/Button";
import type { ScheduleDraft } from "../../batch-change-form";
import { ScheduleCard } from "./ScheduleCard";

export function BatchScheduleEditor({
  drafts,
  onAdd,
  onRemove,
  onRestore,
  onUpdate,
}: {
  drafts: ScheduleDraft[];
  onAdd: () => void;
  onRemove: (key: string) => void;
  onRestore: (key: string) => void;
  onUpdate: (key: string, values: BatchSchedule) => void;
}) {
  const { t } = useTranslation("registration");

  return (
    <article
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      id="schedules"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-bp-graphite">
            {t("form.schedules.title")}
          </h2>
          <p className="mt-1 text-sm text-bp-muted">
            {t("form.schedules.subtitle")}
          </p>
        </div>
        <Button onClick={onAdd} size="compact">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("form.schedules.add")}
        </Button>
      </div>
      {drafts.length === 0 ? (
        <p className="mt-4 text-sm text-bp-muted">
          {t("form.schedules.empty")}
        </p>
      ) : null}
      <div className="mt-4 space-y-3">
        {drafts.map((draft, index) => (
          <ScheduleCard
            draft={draft}
            index={index}
            key={draft.key}
            onRemove={onRemove}
            onRestore={onRestore}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </article>
  );
}
