import { useTranslation } from "react-i18next";
import type { ExecutionJobKind } from "./JobLogViewer";

export function JobKindBadge({ kind }: { kind: ExecutionJobKind }) {
  const { t } = useTranslation("executionRequests");
  const className =
    kind === "gate" ? "bg-orange-50 text-orange-800" : "bg-sky-50 text-sky-800";

  return (
    <span className={`rounded-md px-2 py-1 text-xs font-bold ${className}`}>
      {t(`runDetail.jobs.kind.${kind}`)}
    </span>
  );
}
