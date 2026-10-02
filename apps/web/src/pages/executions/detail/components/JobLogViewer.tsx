import type {
  ExecutionJobLog,
  ExecutionRunPresentation as ExecutionRun,
} from "@batchplane/ui-client";
import { Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
export type ExecutionJobItem = NonNullable<ExecutionRun["jobs"]>[number];
export type ExecutionJobKind = "business" | "gate" | "source";
type LogViewMode = "focused" | "full";
const maxRenderedLogLines = 500;

export function JobLogViewer({
  job,
  kind,
  log,
  searchTerm,
  setSearchTerm,
}: {
  job: ExecutionJobItem;
  kind: ExecutionJobKind;
  log: ExecutionJobLog;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
}) {
  const { t } = useTranslation("executionRequests");
  const [viewMode, setViewMode] = useState<LogViewMode>(
    kind === "business" ? "focused" : "full",
  );
  const focusedLog = kind === "business" ? log.businessSection : null;
  const visibleContent =
    kind === "business" && viewMode === "focused" && focusedLog
      ? focusedLog.content
      : log.content;
  const focusedFallback =
    kind === "business" &&
    viewMode === "focused" &&
    focusedLog?.focused === false;
  const view = buildLogView(visibleContent, searchTerm);

  function downloadLog() {
    const blob = new Blob([log.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `batchplane-job-${log.jobId}.log`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="min-w-0 max-w-full rounded-lg border border-slate-200 bg-slate-950 p-3 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">
            {t("runDetail.jobs.logPreview", { name: job.name })}
          </h3>
          <p className="mt-1 text-xs font-semibold text-slate-300">
            {t("runDetail.jobs.rawLogNotPersisted")}
          </p>
        </div>
        <button
          className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100"
          onClick={downloadLog}
          type="button"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {t("runDetail.jobs.downloadLog")}
        </button>
      </div>
      {kind === "business" ? (
        <div className="mt-3 inline-flex rounded-md border border-slate-700 bg-slate-900 p-1">
          <button
            className={`rounded px-3 py-1.5 text-sm font-semibold ${
              viewMode === "focused"
                ? "bg-slate-100 text-slate-950"
                : "text-slate-200"
            }`}
            onClick={() => setViewMode("focused")}
            type="button"
          >
            {t("runDetail.jobs.batchCommandView")}
          </button>
          <button
            className={`rounded px-3 py-1.5 text-sm font-semibold ${
              viewMode === "full"
                ? "bg-slate-100 text-slate-950"
                : "text-slate-200"
            }`}
            onClick={() => setViewMode("full")}
            type="button"
          >
            {t("runDetail.jobs.fullLogView")}
          </button>
        </div>
      ) : null}
      {focusedFallback ? (
        <p className="mt-3 rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200">
          {t("runDetail.jobs.batchCommandFallback")}
        </p>
      ) : null}
      <label className="mt-3 block text-sm font-semibold text-slate-100">
        {t("runDetail.jobs.searchLog")}
        <input
          className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100"
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder={t("runDetail.jobs.searchPlaceholder")}
          value={searchTerm}
        />
      </label>
      {log.truncated ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {t("runDetail.jobs.logTruncated", {
            size: formatBytes(log.sizeBytes),
          })}
        </p>
      ) : null}
      {view.truncatedByView ? (
        <p className="mt-3 rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200">
          {t("runDetail.jobs.logViewTruncated", {
            count: view.totalMatchedLines,
            limit: maxRenderedLogLines,
          })}
        </p>
      ) : null}
      <pre className="mt-3 max-h-96 w-full min-w-0 max-w-full overflow-auto rounded-md bg-black p-3 text-xs leading-relaxed text-slate-100">
        {view.text ||
          (searchTerm.trim()
            ? t("runDetail.jobs.searchEmpty")
            : t("runDetail.jobs.logEmpty"))}
      </pre>
    </section>
  );
}

function buildLogView(content: string, searchTerm: string) {
  const query = searchTerm.trim().toLowerCase();
  const lines = content.split(/\r?\n/u);
  const matchedLines = query
    ? lines.filter((line) => line.toLowerCase().includes(query))
    : lines;
  const visibleLines = matchedLines.slice(0, maxRenderedLogLines);

  return {
    text: visibleLines.join("\n"),
    totalMatchedLines: matchedLines.length,
    truncatedByView: matchedLines.length > visibleLines.length,
  };
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
