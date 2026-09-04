import type { GovernedChangePreviewFile } from "@batchplane/ui-client";
import { AlertTriangle, FileCode2, FileUp } from "lucide-react";

export type GovernedChangePreviewLabels = {
  binarySummary: string;
  emptyFile: string;
  evidenceUnavailable: string;
  preview: string;
  status: Record<GovernedChangePreviewFile["status"], string>;
  subtitle: string;
  title: string;
};

type DiffLine = {
  kind: "added" | "context" | "removed";
  text: string;
};

export function GovernedChangePreviewPanel({
  files,
  labels,
}: {
  files: GovernedChangePreviewFile[];
  labels: GovernedChangePreviewLabels;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">{labels.title}</h2>
      <p className="mt-2 text-sm text-bp-muted">{labels.subtitle}</p>
      <div className="mt-4 space-y-3">
        {files.map((file) => (
          <GovernedChangePreviewFileItem
            file={file}
            key={file.path}
            labels={labels}
          />
        ))}
      </div>
    </article>
  );
}

function GovernedChangePreviewFileItem({
  file,
  labels,
}: {
  file: GovernedChangePreviewFile;
  labels: GovernedChangePreviewLabels;
}) {
  const isBinary = file.contentKind === "BINARY";

  return (
    <section className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {isBinary ? (
            <FileUp
              className="h-4 w-4 shrink-0 text-bp-muted"
              aria-hidden="true"
            />
          ) : (
            <FileCode2
              className="h-4 w-4 shrink-0 text-bp-muted"
              aria-hidden="true"
            />
          )}
          <p className="break-all font-mono text-xs font-semibold text-bp-graphite">
            {file.path}
          </p>
        </div>
        <span className={statusClassName(file.status)}>
          {labels.status[file.status]}
        </span>
      </div>
      {file.evidenceUnavailable ? (
        <div
          className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <p>{labels.evidenceUnavailable}</p>
        </div>
      ) : isBinary ? (
        <BinaryDigestSummary file={file} label={labels.binarySummary} />
      ) : (
        <TextFileDiff file={file} labels={labels} />
      )}
    </section>
  );
}

function TextFileDiff({
  file,
  labels,
}: {
  file: GovernedChangePreviewFile;
  labels: GovernedChangePreviewLabels;
}) {
  const lines = buildDiffLines(file.baseContent ?? "", file.nextContent ?? "");

  return (
    <details className="mt-3" open={file.status !== "UNCHANGED"}>
      <summary className="cursor-pointer text-xs font-semibold text-bp-control">
        {labels.preview}
      </summary>
      <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-bp-graphite p-3 text-xs leading-5 text-white">
        {lines.length === 0
          ? labels.emptyFile
          : lines.map((line, index) => (
              <span
                className={diffLineClassName(line.kind)}
                key={`${index}-${line.kind}`}
              >
                {formatDiffLine(line)}
              </span>
            ))}
      </pre>
    </details>
  );
}

function BinaryDigestSummary({
  file,
  label,
}: {
  file: GovernedChangePreviewFile;
  label: string;
}) {
  return (
    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
      <DigestValue label={`${label} (before)`} value={file.beforeDigest} />
      <DigestValue label={`${label} (after)`} value={file.afterDigest} />
    </dl>
  );
}

function DigestValue({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <dt className="font-semibold text-bp-muted">{label}</dt>
      <dd className="mt-1 break-all font-mono text-bp-graphite">
        {value ?? "-"}
      </dd>
    </div>
  );
}

function buildDiffLines(baseContent: string, nextContent: string): DiffLine[] {
  const baseLines = splitLines(baseContent);
  const nextLines = splitLines(nextContent);
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
    } else if (
      table[baseIndex + 1]![nextIndex]! >= table[baseIndex]![nextIndex + 1]!
    ) {
      lines.push({ kind: "removed", text: baseLines[baseIndex]! });
      baseIndex += 1;
    } else {
      lines.push({ kind: "added", text: nextLines[nextIndex]! });
      nextIndex += 1;
    }
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

function splitLines(content: string): string[] {
  return content ? content.replace(/\n$/, "").split("\n") : [];
}

function formatDiffLine(line: DiffLine): string {
  return `${line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  "}${line.text || " "}`;
}

function diffLineClassName(kind: DiffLine["kind"]): string {
  return kind === "added"
    ? "block text-emerald-200"
    : kind === "removed"
      ? "block text-red-200"
      : "block text-slate-200";
}

function statusClassName(status: GovernedChangePreviewFile["status"]): string {
  const tone = {
    ADDED: "bg-emerald-100 text-emerald-700",
    DELETED: "bg-rose-100 text-rose-700",
    MODIFIED: "bg-amber-100 text-amber-700",
    UNCHANGED: "bg-slate-100 text-slate-700",
  } as const;

  return `rounded-md px-2.5 py-1 text-xs font-semibold ${tone[status]}`;
}
