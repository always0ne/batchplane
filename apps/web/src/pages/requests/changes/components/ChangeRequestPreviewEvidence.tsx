import type { ChangeRequestPreviewFile } from "@batchplane/ui-client";
import { AlertTriangle } from "lucide-react";
import type { ChangeRequestPreviewLabels } from "./ChangeRequestPreviewPanel";
import { BinaryDigestSummary } from "./BinaryDigestSummary";
import { TextFileDiff } from "./TextFileDiff";

export function ChangeRequestPreviewEvidence({
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
