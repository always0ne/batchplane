import type { DashboardSummary } from "@batchplane/ui-client";
import {
  AlertTriangle,
  ClipboardCheck,
  GitBranch,
  History,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

export type DashboardCard = {
  icon: LucideIcon;
  key: string;
  tone: "danger" | "neutral" | "success" | "warning";
  to?: string;
  value: string | number;
};

export function createDashboardCards(
  summary: DashboardSummary,
  values: { actionRequired: string; ready: string },
): DashboardCard[] {
  const pendingApprovals = summary.pendingApprovals.length;

  return [
    {
      icon: GitBranch,
      key: "repoReadiness",
      tone: summary.installation.installed ? "success" : "warning",
      to: "/workspace",
      value: summary.installation.installed
        ? values.ready
        : values.actionRequired,
    },
    {
      icon: ClipboardCheck,
      key: "pendingApprovals",
      tone: pendingApprovals > 0 ? "warning" : "neutral",
      to: "/approvals",
      value: pendingApprovals,
    },
    {
      icon: AlertTriangle,
      key: "failedRuns",
      to: "/executions/failures?type=failed",
      tone: summary.failedRunCount > 0 ? "danger" : "neutral",
      value: summary.failedRunCount,
    },
    {
      icon: ShieldAlert,
      key: "gateBlocked",
      to: "/executions/failures?type=blocked",
      tone: summary.gateBlockedRunCount > 0 ? "warning" : "neutral",
      value: summary.gateBlockedRunCount,
    },
    {
      icon: History,
      key: "auditTrail",
      tone: "neutral",
      to: "/audit",
      value: summary.auditItems.length,
    },
  ];
}
