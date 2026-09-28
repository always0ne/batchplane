import type { ChangeRequestPreviewFile } from "@batchplane/ui-client";
import { ChangeRequestPreviewFileItem } from "./ChangeRequestPreviewFileItem";

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
