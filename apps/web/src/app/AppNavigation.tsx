import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  FileText,
  History,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

const navigationSections = [
  {
    labelKey: "groups.overview",
    items: [
      { icon: LayoutDashboard, labelKey: "items.dashboard", to: "/dashboard" },
      { icon: Inbox, labelKey: "items.myWork", to: "/my-work" },
    ],
  },
  {
    labelKey: "groups.operations",
    items: [
      { icon: ListChecks, labelKey: "items.batches", to: "/batches" },
      { icon: Activity, labelKey: "items.runs", to: "/runs" },
      { icon: AlertTriangle, labelKey: "items.failures", to: "/failures" },
    ],
  },
  {
    labelKey: "groups.governance",
    items: [
      { icon: FileText, labelKey: "items.requests", to: "/requests" },
      { icon: ClipboardCheck, labelKey: "items.approvals", to: "/approvals" },
      { icon: History, labelKey: "items.audit", to: "/audit" },
    ],
  },
  {
    labelKey: "groups.workspace",
    items: [{ icon: Settings, labelKey: "items.setup", to: "/lite/setup" }],
  },
] as const;

type AppNavigationProps = {
  variant: "desktop" | "mobile";
};

export function AppNavigation({ variant }: AppNavigationProps) {
  const { t } = useTranslation("navigation");

  return (
    <>
      {navigationSections.map((section) => (
        <div
          aria-label={t(section.labelKey)}
          className={
            variant === "desktop"
              ? "space-y-1"
              : "flex shrink-0 items-center gap-2"
          }
          key={section.labelKey}
          role="group"
        >
          <p
            className={
              variant === "desktop"
                ? "px-3 text-xs font-bold uppercase text-slate-400"
                : "shrink-0 text-xs font-bold uppercase text-slate-400"
            }
          >
            {t(section.labelKey)}
          </p>
          {section.items.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    "inline-flex items-center gap-2 rounded-lg text-sm font-semibold",
                    variant === "desktop"
                      ? "w-full px-3 py-2"
                      : "shrink-0 whitespace-nowrap px-3 py-2",
                    isActive
                      ? "bg-bp-control text-white"
                      : "text-bp-muted hover:bg-slate-100 hover:text-bp-graphite",
                  ].join(" ")
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {t(item.labelKey)}
              </NavLink>
            );
          })}
        </div>
      ))}
    </>
  );
}
