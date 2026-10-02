import type { ChangeRequestPreviewFile } from "@batchplane/ui-client";
import { FileCode2, FileUp } from "lucide-react";
import type { ChangeRequestPreviewLabels } from "./ChangeRequestPreviewPanel";
import { ChangeRequestPreviewEvidence } from "./ChangeRequestPreviewEvidence";

export function ChangeRequestPreviewFileItem({
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

function statusClassName(status: ChangeRequestPreviewFile["status"]): string {
  const tone = {
    ADDED: "bg-emerald-100 text-emerald-700",
    DELETED: "bg-rose-100 text-rose-700",
    MODIFIED: "bg-amber-100 text-amber-700",
    UNCHANGED: "bg-slate-100 text-slate-700",
  } as const;

  return `rounded-md px-2.5 py-1 text-xs font-semibold ${tone[status]}`;
}
