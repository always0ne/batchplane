import type { ChangeRequestPreviewFile } from "@batchplane/ui-client";
import { AlertTriangle, FileCode2, FileUp } from "lucide-react";
import {
  buildDiffLines,
  type ChangeRequestDiffLine,
} from "./change-request-diff";

export type ChangeRequestPreviewLabels = {
  binarySummary: string;
  emptyFile: string;
  evidenceUnavailable: string;
  preview: string;
  status: Record<ChangeRequestPreviewFile["status"], string>;
  subtitle: string;
  title: string;
};

export function ChangeRequestPreviewPanel({
  files,
  labels,
}: {
  files: ChangeRequestPreviewFile[];
  labels: ChangeRequestPreviewLabels;
}) {
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">{labels.title}</h2>
      <p className="mt-2 text-sm text-bp-muted">{labels.subtitle}</p>
      <div className="mt-4 space-y-3">
        {files.map((file) => (
          <ChangeRequestPreviewFileItem
            file={file}
            key={file.path}
            labels={labels}
          />
        ))}
      </div>
    </article>
  );
}

function ChangeRequestPreviewFileItem({
  file,
  labels,
}: {
  file: ChangeRequestPreviewFile;
  labels: ChangeRequestPreviewLabels;
}) {
  const isBinary = file.contentKind === "BINARY";

  return (
    <section className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-3">
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
      <ChangeRequestPreviewEvidence file={file} labels={labels} />
    </section>
  );
}

function ChangeRequestPreviewEvidence({
  file,
  labels,
}: {
  file: ChangeRequestPreviewFile;
  labels: ChangeRequestPreviewLabels;
}) {
  if (file.evidenceUnavailable) {
    return (
      <div
        className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        role="status"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{labels.evidenceUnavailable}</p>
      </div>
    );
  }

  if (file.contentKind === "BINARY") {
    return <BinaryDigestSummary file={file} label={labels.binarySummary} />;
  }

  return <TextFileDiff file={file} labels={labels} />;
}

function TextFileDiff({
  file,
  labels,
}: {
  file: ChangeRequestPreviewFile;
  labels: ChangeRequestPreviewLabels;
}) {
  const lines = buildDiffLines(file.baseContent ?? "", file.nextContent ?? "");

  return (
    <details className="mt-3" open={file.status !== "UNCHANGED"}>
      <summary className="cursor-pointer text-xs font-semibold text-bp-control">
        {labels.preview}
      </summary>
      <pre className="mt-2 max-h-72 min-w-0 max-w-full overflow-auto rounded-md bg-bp-graphite p-3 text-xs leading-5 text-white">
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
  file: ChangeRequestPreviewFile;
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

function formatDiffLine(line: ChangeRequestDiffLine): string {
  let prefix = "  ";
  if (line.kind === "added") {
    prefix = "+ ";
  } else if (line.kind === "removed") {
    prefix = "- ";
  }

  return `${prefix}${line.text || " "}`;
}

function diffLineClassName(kind: ChangeRequestDiffLine["kind"]): string {
  switch (kind) {
    case "added":
      return "block text-emerald-200";
    case "removed":
      return "block text-red-200";
    case "context":
      return "block text-slate-200";
  }
}

function statusClassName(status: ChangeRequestPreviewFile["status"]): string {
  const tone = {
    ADDED: "bg-emerald-100 text-emerald-700",
    DELETED: "bg-rose-100 text-rose-700",
    MODIFIED: "bg-amber-100 text-amber-700",
    UNCHANGED: "bg-slate-100 text-slate-700",
  } as const;

  return `rounded-md px-2.5 py-1 text-xs font-semibold ${tone[status]}`;
}
