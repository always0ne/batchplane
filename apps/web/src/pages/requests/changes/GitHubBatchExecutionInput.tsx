import type { GitHubActionsExecutionSettings } from "@batchplane/ui-client";
import { FileUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import { isKnownRunnerLabel, knownRunnerLabels } from "./batch-change-form";

export function GitHubBatchExecutionInput({
  onChange,
  onFileChange,
  value,
}: {
  onChange: (value: GitHubActionsExecutionSettings) => void;
  onFileChange: (file?: File) => Promise<void>;
  value: GitHubActionsExecutionSettings;
}) {
  const { t } = useTranslation("registration");
  const customRunner = !isKnownRunnerLabel(value.runnerLabel);
  const fileName = value.upload?.fileName ?? value.existingFile?.fileName;

  function update<Key extends keyof GitHubActionsExecutionSettings>(
    key: Key,
    next: GitHubActionsExecutionSettings[Key],
  ) {
    onChange({ ...value, [key]: next });
  }

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="text-lg font-semibold text-bp-graphite">
          {t("form.workflow")}
        </h2>
        <p className="text-sm font-medium text-bp-muted">
          {t("form.gateRequiredInline")}
        </p>
      </div>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        <label className="grid min-w-0 grid-cols-1 gap-1 text-sm font-semibold text-bp-graphite">
          {t("form.workflowRef")}
          <input
            className="min-w-0 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-bp-graphite"
            onChange={(event) => update("ref", event.target.value)}
            placeholder={t("form.placeholders.workflowRef")}
            value={value.ref}
          />
        </label>
        <div className="grid min-w-0 grid-cols-1 gap-3">
          <label className="grid min-w-0 grid-cols-1 gap-1 text-sm font-semibold text-bp-graphite">
            {t("form.runnerLabel")}
            <select
              className="min-w-0 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-bp-graphite"
              onChange={(event) =>
                update(
                  "runnerLabel",
                  event.target.value === "CUSTOM" ? "" : event.target.value,
                )
              }
              value={customRunner ? "CUSTOM" : value.runnerLabel}
            >
              {[...knownRunnerLabels, "CUSTOM"].map((runner) => (
                <option key={runner} value={runner}>
                  {runner === "CUSTOM" ? t("form.customRunner") : runner}
                </option>
              ))}
            </select>
          </label>
          {customRunner ? (
            <label className="grid min-w-0 grid-cols-1 gap-1 text-sm font-semibold text-bp-graphite">
              {t("form.customRunnerLabel")}
              <input
                className="min-w-0 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-bp-graphite"
                onChange={(event) => update("runnerLabel", event.target.value)}
                placeholder={t("form.placeholders.customRunner")}
                value={value.runnerLabel}
              />
            </label>
          ) : null}
        </div>
        <label className="grid min-w-0 grid-cols-1 gap-1 text-sm font-semibold text-bp-graphite">
          {t("form.executionFile")}
          <span className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-bp-muted">
            <FileUp aria-hidden="true" className="h-4 w-4 shrink-0" />
            <input
              className="min-w-0 w-full text-xs"
              onChange={(event) => void onFileChange(event.target.files?.[0])}
              type="file"
            />
          </span>
          {fileName ? (
            <span className="break-all font-mono text-xs font-medium text-bp-muted">
              {fileName}
            </span>
          ) : null}
          {value.existingFile && !value.upload ? (
            <>
              <span className="break-all text-xs text-bp-muted">
                {t("form.existingArtifact", {
                  name: value.existingFile.fileName,
                })}
              </span>
              <span className="break-all text-xs text-bp-muted">
                {value.existingFile.locator}
              </span>
            </>
          ) : null}
        </label>
      </div>
      <label className="mt-4 grid min-w-0 grid-cols-1 gap-1 text-sm font-semibold text-bp-graphite">
        {t("form.runCommand")}
        <textarea
          className="min-h-28 min-w-0 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm font-medium text-bp-graphite"
          onChange={(event) => update("command", event.target.value)}
          placeholder={t("form.placeholders.runCommand")}
          value={value.command}
        />
      </label>
    </article>
  );
}
