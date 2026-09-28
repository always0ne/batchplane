import {
  AlertTriangle,
  GitPullRequest,
  ListChecks,
  UserCheck,
} from "lucide-react";
import type { WorkKind, WorkRow } from "../work-rows";

export function WorkIcon({
  kind,
  priority,
}: {
  kind: WorkKind;
  priority: WorkRow["priority"];
}) {
  const iconClassName = priority === "high" ? "text-red-700" : "text-bp-git";
  const Icon = {
    approval: UserCheck,
    failureFollowUp: AlertTriangle,
    registration: GitPullRequest,
    request: ListChecks,
  }[kind];

  return (
    <span className="mt-1 rounded-md bg-slate-100 p-2">
      <Icon className={`h-4 w-4 ${iconClassName}`} aria-hidden="true" />
    </span>
  );
}
