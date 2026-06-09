import type {
  GovernedChangeFilePreview,
  GovernedChangeFilePreviewStatus,
} from "@batchplane/domain";
import { FileCode2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  hasNoGovernedFileChanges,
  type GovernedChangePreviewState,
} from "./governed-change-preview";
export type { GovernedChangePreviewState } from "./governed-change-preview";

type DiffLine = {
  kind: "added" | "context" | "removed";
  text: string;
};

export function GovernedChangePreviewPanel({
  namespace,
  state,
}: {
  namespace: "registration" | "schedules";
  state: GovernedChangePreviewState;
}) {
  const { t } = useTranslation(namespace);
  const noChanges = hasNoGovernedFileChanges(state);

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("diff.title")}
      </h2>
      <p className="mt-2 text-sm text-bp-muted">{t("diff.subtitle")}</p>

      {state.type === "idle" ? (
        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
          {t("diff.idle")}
        </p>
      ) : null}

      {state.type === "loading" ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t("diff.loading")}
        </p>
      ) : null}

      {state.type === "no-session" ? (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {t("diff.noSession")}
        </p>
      ) : null}

      {state.type === "error" ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {state.message}
        </p>
      ) : null}

      {state.type === "ready" ? (
        <div className="mt-4 space-y-3">
          {noChanges ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              {t("diff.noChanges")}
            </p>
          ) : null}
          {state.files.map((file) => (
            <GovernedChangeFilePreviewItem
              file={file}
              key={file.path}
              namespace={namespace}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function GovernedChangeFilePreviewItem({
  file,
  namespace,
}: {
  file: GovernedChangeFilePreview;
  namespace: "registration" | "schedules";
}) {
  const { t } = useTranslation(namespace);
  const lines = buildDiffLines(file.baseContent, file.nextContent);

  return (
    <section className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-bp-muted" aria-hidden="true" />
          <p className="font-mono text-xs font-semibold text-bp-graphite">
            {file.path}
          </p>
        </div>
        <GovernedChangeStatusBadge namespace={namespace} status={file.status} />
      </div>
      <details className="mt-2" open={file.status !== "UNCHANGED"}>
        <summary className="cursor-pointer text-xs font-semibold text-bp-control">
          {t("diff.preview")}
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-bp-graphite p-3 text-xs leading-5 text-white">
          {lines.length > 0 ? (
            lines.map((line, index) => (
              <span
                className={
                  line.kind === "added"
                    ? "block text-emerald-200"
                    : line.kind === "removed"
                      ? "block text-red-200"
                      : "block text-slate-200"
                }
                key={`${index}-${line.kind}`}
              >
                {formatDiffLine(line)}
              </span>
            ))
          ) : (
            <span>{t("diff.empty")}</span>
          )}
        </pre>
      </details>
    </section>
  );
}

function GovernedChangeStatusBadge({
  namespace,
  status,
}: {
  namespace: "registration" | "schedules";
  status: GovernedChangeFilePreviewStatus;
}) {
  const { t } = useTranslation(namespace);
  const styleMap = {
    ADDED: "bg-emerald-100 text-emerald-700",
    DELETED: "bg-red-100 text-red-700",
    MODIFIED: "bg-amber-100 text-amber-700",
    UNCHANGED: "bg-slate-100 text-slate-700",
  } as const;

  return (
    <span
      className={`rounded-md px-2.5 py-1 text-xs font-semibold ${styleMap[status]}`}
    >
      {t(`diff.status.${status}`)}
    </span>
  );
}

function buildDiffLines(baseContent: string, nextContent: string): DiffLine[] {
  const baseLines = splitDiffContent(baseContent);
  const nextLines = splitDiffContent(nextContent);
  const table = Array.from({ length: baseLines.length + 1 }, () =>
    Array<number>(nextLines.length + 1).fill(0),
  );

  for (let baseIndex = baseLines.length - 1; baseIndex >= 0; baseIndex -= 1) {
    for (let nextIndex = nextLines.length - 1; nextIndex >= 0; nextIndex -= 1) {
      table[baseIndex]![nextIndex] =
        baseLines[baseIndex] === nextLines[nextIndex]
          ? table[baseIndex + 1]![nextIndex + 1]! + 1
          : Math.max(
              table[baseIndex + 1]![nextIndex]!,
              table[baseIndex]![nextIndex + 1]!,
            );
    }
  }

  const lines: DiffLine[] = [];
  let baseIndex = 0;
  let nextIndex = 0;

  while (baseIndex < baseLines.length && nextIndex < nextLines.length) {
    if (baseLines[baseIndex] === nextLines[nextIndex]) {
      lines.push({ kind: "context", text: baseLines[baseIndex]! });
      baseIndex += 1;
      nextIndex += 1;
      continue;
    }

    if (
      table[baseIndex + 1]![nextIndex]! >= table[baseIndex]![nextIndex + 1]!
    ) {
      lines.push({ kind: "removed", text: baseLines[baseIndex]! });
      baseIndex += 1;
      continue;
    }

    lines.push({ kind: "added", text: nextLines[nextIndex]! });
    nextIndex += 1;
  }

  while (baseIndex < baseLines.length) {
    lines.push({ kind: "removed", text: baseLines[baseIndex]! });
    baseIndex += 1;
  }

  while (nextIndex < nextLines.length) {
    lines.push({ kind: "added", text: nextLines[nextIndex]! });
    nextIndex += 1;
  }

  return lines;
}

function splitDiffContent(content: string): string[] {
  if (!content) {
    return [];
  }

  return content.replace(/\n$/, "").split("\n");
}

function formatDiffLine(line: DiffLine): string {
  const prefix =
    line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  ";

  return `${prefix}${line.text || " "}`;
}
