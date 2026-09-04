import type { BatchSchedule } from "@batchplane/domain";
import { FileUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../ui/Button";
import {
  criticalityOptions,
  isKnownRunnerLabel,
  knownRunnerLabels,
  statusOptions,
  type BatchChangeFormValues,
  type ScheduleDraft,
} from "./batch-change-form";
import { getCronPreview } from "./cron-preview";

export function BatchChangeFormRegions({
  existingArtifact,
  onAddSchedule,
  onArtifactChange,
  onRemoveSchedule,
  onRestoreSchedule,
  onScheduleChange,
  onValueChange,
  scheduleDrafts,
  values,
}: {
  existingArtifact?: { fileName: string; locator: string };
  onAddSchedule: () => void;
  onArtifactChange: (file?: File) => Promise<void>;
  onRemoveSchedule: (key: string) => void;
  onRestoreSchedule: (key: string) => void;
  onScheduleChange: (key: string, values: BatchSchedule) => void;
  onValueChange: (field: keyof BatchChangeFormValues, value: string) => void;
  scheduleDrafts: ScheduleDraft[];
  values: BatchChangeFormValues;
}) {
  const { t } = useTranslation("registration");

  return (
    <>
      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-bp-graphite">
          {t("form.definition")}
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextField
            label={t("form.batchId")}
            onChange={(value) => onValueChange("batchId", value)}
            placeholder={t("form.placeholders.batchId")}
            value={values.batchId}
          />
          <TextField
            label={t("form.name")}
            onChange={(value) => onValueChange("name", value)}
            placeholder={t("form.placeholders.name")}
            value={values.name}
          />
          <TextField
            label={t("form.owner")}
            onChange={(value) => onValueChange("owner", value)}
            placeholder={t("form.placeholders.owner")}
            value={values.owner}
          />
          <TextField
            label={t("form.domain")}
            onChange={(value) => onValueChange("domain", value)}
            placeholder={t("form.placeholders.domain")}
            value={values.domain}
          />
          <TextField
            label={t("form.environment")}
            onChange={(value) => onValueChange("environment", value)}
            placeholder={t("form.placeholders.environment")}
            value={values.environment}
          />
          <SelectField
            label={t("form.criticality")}
            onChange={(value) => onValueChange("criticality", value)}
            options={criticalityOptions}
            value={values.criticality}
          />
          <SelectField
            label={t("form.status")}
            onChange={(value) => onValueChange("status", value)}
            options={statusOptions}
            value={values.status}
          />
          <TextField
            label={t("form.workflowRef")}
            onChange={(value) => onValueChange("workflowRef", value)}
            placeholder={t("form.placeholders.workflowRef")}
            value={values.workflowRef}
          />
        </div>
      </article>
      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className="text-lg font-semibold text-bp-graphite">
            {t("form.workflow")}
          </h2>
          <p className="text-sm font-medium text-bp-muted">
            {t("form.gateRequiredInline")}
          </p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <RunnerField
            runnerLabel={values.runnerLabel}
            onChange={(value) => onValueChange("runnerLabel", value)}
          />
          <ArtifactField
            currentFileName={values.artifactFileName}
            existingArtifact={existingArtifact}
            onChange={onArtifactChange}
          />
        </div>
        <TextAreaField
          label={t("form.runCommand")}
          onChange={(value) => onValueChange("runCommand", value)}
          placeholder={t("form.placeholders.runCommand")}
          value={values.runCommand}
        />
      </article>
      <ScheduleEditor
        drafts={scheduleDrafts}
        onAdd={onAddSchedule}
        onRemove={onRemoveSchedule}
        onRestore={onRestoreSchedule}
        onUpdate={onScheduleChange}
      />
    </>
  );
}

function RunnerField({
  onChange,
  runnerLabel,
}: {
  onChange: (value: string) => void;
  runnerLabel: string;
}) {
  const { t } = useTranslation("registration");
  const useCustomRunner = !isKnownRunnerLabel(runnerLabel);

  return (
    <div className="grid gap-3">
      <SelectField
        label={t("form.runnerLabel")}
        onChange={(value) => onChange(value === "CUSTOM" ? "" : value)}
        options={[...knownRunnerLabels, "CUSTOM"]}
        optionLabel={(option) =>
          option === "CUSTOM" ? t("form.customRunner") : option
        }
        value={useCustomRunner ? "CUSTOM" : runnerLabel}
      />
      {useCustomRunner ? (
        <TextField
          label={t("form.customRunnerLabel")}
          onChange={onChange}
          placeholder={t("form.placeholders.customRunner")}
          value={runnerLabel}
        />
      ) : null}
    </div>
  );
}

function ArtifactField({
  currentFileName,
  existingArtifact,
  onChange,
}: {
  currentFileName?: string;
  existingArtifact?: { fileName: string; locator: string };
  onChange: (file?: File) => Promise<void>;
}) {
  const { t } = useTranslation("registration");
  const visibleName = currentFileName ?? existingArtifact?.fileName;

  return (
    <label className="grid gap-1 text-sm font-semibold text-bp-graphite">
      {t("form.executionFile")}
      <span className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-bp-muted">
        <FileUp className="h-4 w-4 shrink-0" aria-hidden="true" />
        <input
          className="min-w-0 text-xs"
          onChange={(event) => void onChange(event.target.files?.[0])}
          type="file"
        />
      </span>
      {visibleName ? (
        <span className="break-all font-mono text-xs font-medium text-bp-muted">
          {visibleName}
        </span>
      ) : null}
      {existingArtifact && !currentFileName ? (
        <span className="text-xs text-bp-muted">
          {t("form.existingArtifact", { name: existingArtifact.fileName })}
        </span>
      ) : null}
    </label>
  );
}

function ScheduleEditor({
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

function ScheduleCard({
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
        <Button
          onClick={() =>
            isDeleted ? onRestore(draft.key) : onRemove(draft.key)
          }
          size="compact"
          variant="secondary"
        >
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
        <CronPreview
          cronPreview={cronPreview}
          locale={i18n.language}
          timezone={draft.values.timezone.trim()}
        />
      ) : null}
    </section>
  );
}

function CronPreview({
  cronPreview,
  locale,
  timezone,
}: {
  cronPreview: ReturnType<typeof getCronPreview>;
  locale: string;
  timezone: string;
}) {
  const { t } = useTranslation("registration");

  if (!cronPreview.ok) {
    return (
      <p className="mt-3 text-xs font-medium text-rose-700">
        {t(`form.schedules.cronPreviewErrors.${cronPreview.errorCode}`)}
      </p>
    );
  }

  return (
    <div className="mt-3 text-xs text-bp-muted">
      <p className="font-semibold text-bp-graphite">
        {t("form.schedules.cronPreviewTitle")}
      </p>
      <ol className="mt-1 list-decimal space-y-1 pl-5">
        {cronPreview.dates.map((date) => (
          <li key={date.toISOString()}>
            {date.toLocaleString(locale, { timeZone: timezone })}
          </li>
        ))}
      </ol>
    </div>
  );
}

function TextField({
  disabled = false,
  label,
  onChange,
  placeholder,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-bp-graphite">
      {label}
      <input
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-bp-graphite disabled:bg-slate-100"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function TextAreaField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="mt-4 grid gap-1 text-sm font-semibold text-bp-graphite">
      {label}
      <textarea
        className="min-h-28 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm font-medium text-bp-graphite"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  optionLabel = (option) => option,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  optionLabel?: (option: string) => string;
  options: readonly string[];
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-bp-graphite">
      {label}
      <select
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-bp-graphite"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
