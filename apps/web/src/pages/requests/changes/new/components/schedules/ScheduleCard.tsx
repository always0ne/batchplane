import type { BatchSchedule } from "@batchplane/domain";
import { RotateCcw, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../../../components/Button";
import type { ScheduleDraft } from "../../batch-change-form";
import { getCronPreview } from "./cron-preview";
import { ScheduleCronPreview } from "./ScheduleCronPreview";
import { TextField } from "../TextField";

export function ScheduleCard({
  draft,
  index,
  onRemove,
  onRestore,
  onUpdate,
}: {
  draft: ScheduleDraft;
  index: number;
  onRemove: (key: string) => void;
  onRestore: (key: string) => void;
  onUpdate: (key: string, values: BatchSchedule) => void;
}) {
  const { i18n, t } = useTranslation("registration");
  const isDeleted = draft.status === "deleted";
  const cronPreview = useMemo(
    () => getCronPreview(draft.values.cron, draft.values.timezone),
    [draft.values.cron, draft.values.timezone],
  );

  function update(field: keyof BatchSchedule, value: string | boolean) {
    onUpdate(draft.key, { ...draft.values, [field]: value });
  }

  function toggleDeletion() {
    if (isDeleted) {
      onRestore(draft.key);
    } else {
      onRemove(draft.key);
    }
  }

  return (
    <section
      className={`rounded-md border p-4 ${isDeleted ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-bp-graphite">
              {t("form.schedules.itemTitle", { index: index + 1 })}
            </h3>
            <span className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-bp-muted">
              {isDeleted
                ? t("form.schedules.pendingDeletion")
                : t(`form.schedules.${draft.source}`)}
            </span>
          </div>
          {isDeleted ? (
            <p className="mt-1 text-xs font-semibold text-amber-900">
              {t("form.schedules.pendingDeletionHelp")}
            </p>
          ) : null}
        </div>
        <Button onClick={toggleDeletion} size="compact" variant="secondary">
          {isDeleted ? (
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          )}
          {isDeleted ? t("form.schedules.restore") : t("form.schedules.remove")}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <TextField
          disabled={isDeleted || draft.source === "existing"}
          label={t("form.schedules.scheduleId")}
          onChange={(value) => update("scheduleId", value)}
          placeholder={t("form.schedules.placeholders.scheduleId")}
          value={draft.values.scheduleId}
        />
        <TextField
          disabled={isDeleted}
          label={t("form.schedules.name")}
          onChange={(value) => update("name", value)}
          placeholder={t("form.schedules.placeholders.name")}
          value={draft.values.name}
        />
        <TextField
          disabled={isDeleted}
          label={t("form.schedules.cron")}
          onChange={(value) => update("cron", value)}
          placeholder={t("form.schedules.placeholders.cron")}
          value={draft.values.cron}
        />
        <TextField
          disabled={isDeleted}
          label={t("form.schedules.timezone")}
          onChange={(value) => update("timezone", value)}
          placeholder={t("form.schedules.placeholders.timezone")}
          value={draft.values.timezone}
        />
        <label className="flex items-center gap-2 self-end text-sm font-semibold text-bp-graphite">
          <input
            checked={draft.values.enabled}
            disabled={isDeleted}
            onChange={(event) => update("enabled", event.target.checked)}
            type="checkbox"
          />
          {t("form.schedules.enabled")}
        </label>
      </div>
      {!isDeleted ? (
        <ScheduleCronPreview
          cronPreview={cronPreview}
          locale={i18n.language}
          timezone={draft.values.timezone.trim()}
        />
      ) : null}
    </section>
  );
}
