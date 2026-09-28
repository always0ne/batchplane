import type { ChangeRequestPreviewFile } from "@batchplane/ui-client";
import type { ChangeRequestPreviewLabels } from "./ChangeRequestPreviewPanel";
import {
  buildDiffLines,
  type ChangeRequestDiffLine,
} from "./change-request-diff";

export function TextFileDiff({
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
