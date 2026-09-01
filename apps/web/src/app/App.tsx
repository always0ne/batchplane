import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  FileText,
  GitBranch,
  History,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Settings,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BatchesPage } from "../pages/batches/BatchesPage";
import { BatchDetailPage } from "../features/batches/BatchDetailPage";
import { ExecutionRequestDetailPage } from "../features/execution-requests/ExecutionRequestDetailPage";
import { ExecutionRequestPage } from "../features/execution-requests/ExecutionRequestPage";
import { ExecutionRunDetailPage } from "../features/execution-requests/ExecutionRunDetailPage";
import { ExecutionRunListPage } from "../features/execution-requests/ExecutionRunListPage";
import { ApprovalsPage } from "../features/approvals/ApprovalsPage";
import { AuditPage } from "../features/audit/AuditPage";
import { RegistrationApprovalDetailPage } from "../features/approvals/RegistrationApprovalDetailPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { LiteSetupPage } from "../features/lite-setup/LiteSetupPage";
import { MyWorkPage } from "../features/my-work/MyWorkPage";
import { BatchRegistrationPage } from "../features/registration/BatchRegistrationPage";
import { WorkspaceRequestsPage } from "../features/requests/WorkspaceRequestsPage";
import {
  localeLabels,
  supportedLocales,
  type SupportedLocale,
} from "../i18n/locales";
import { writeStoredLocale } from "../i18n/locale-detector";
import {
  isRuntimeFixtureSwitcherEnabled,
  readRuntimeFixtureSelection,
  runtimeFixtureOptions,
  type RuntimeFixtureId,
  writeRuntimeFixtureSelection,
} from "../runtime/runtime-fixtures";

const navSections = [
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
const compactMarkSrc = `${import.meta.env.BASE_URL}assets/batchplane-compact-mark.svg`;

export function App() {
  const { i18n, t } = useTranslation(["common", "navigation"]);
  const [runtimeFixture, setRuntimeFixture] = useState(() =>
    readRuntimeFixtureSelection(),
  );
  const showRuntimeFixtureSwitcher = isRuntimeFixtureSwitcherEnabled();

  const activeLocale = useMemo(() => {
    const language = i18n.resolvedLanguage ?? i18n.language;
    return (
      supportedLocales.find((locale) => language.startsWith(locale)) ?? "en"
    );
  }, [i18n.language, i18n.resolvedLanguage]);

  function changeLocale(locale: SupportedLocale) {
    writeStoredLocale(locale);
    void i18n.changeLanguage(locale);
  }

  function changeRuntimeFixture(fixtureId: RuntimeFixtureId) {
    writeRuntimeFixtureSelection(fixtureId);
    setRuntimeFixture(fixtureId);
  }

  return (
    <div className="min-h-screen bg-bp-surface">
      <aside
        aria-label={t("navigation:landmarks.desktopPrimary")}
        className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-200 bg-white p-5 lg:block"
      >
        <div className="flex items-center gap-3">
          <img
            alt=""
            className="h-11 w-11 rounded-xl"
            data-testid="app-logo"
            src={compactMarkSrc}
          />
          <div>
            <p className="text-lg font-bold text-bp-graphite">
              {t("common:app.name")}
            </p>
            <p className="text-sm font-medium text-bp-git">
              {t("common:app.edition")}
            </p>
          </div>
        </div>
        <nav className="mt-8 space-y-5">
          <NavigationLinks variant="desktop" />
        </nav>
      </aside>

      <main className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-bp-muted">
              <GitBranch className="h-4 w-4 text-bp-git" aria-hidden="true" />
              {t("common:app.tagline")}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {showRuntimeFixtureSwitcher ? (
                <label
                  className="flex items-center gap-2 text-sm text-bp-muted"
                  title={t("common:devRuntime.description")}
                >
                  <span>{t("common:devRuntime.label")}</span>
                  <select
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-bp-graphite"
                    value={runtimeFixture}
                    onChange={(event) =>
                      changeRuntimeFixture(
                        event.target.value as RuntimeFixtureId,
                      )
                    }
                  >
                    {runtimeFixtureOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {t(`common:${option.labelKey}`)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-bp-muted">
                <span>{t("settings:language")}</span>
                <select
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-bp-graphite"
                  value={activeLocale}
                  onChange={(event) =>
                    changeLocale(event.target.value as SupportedLocale)
                  }
                >
                  {supportedLocales.map((locale) => (
                    <option key={locale} value={locale}>
                      {localeLabels[locale]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <nav
            aria-label={t("navigation:landmarks.mobilePrimary")}
            className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden"
          >
            <NavigationLinks variant="mobile" />
          </nav>
        </header>
        <div className="p-4 sm:p-5" key={runtimeFixture}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/my-work" element={<MyWorkPage />} />
            <Route path="/batches" element={<BatchesPage />} />
            <Route path="/batches/new" element={<BatchRegistrationPage />} />
            <Route path="/batches/:batchId" element={<BatchDetailPage />} />
            <Route
              path="/batches/:batchId/schedules/new"
              element={<ScheduleManagementRedirect />}
            />
            <Route
              path="/batches/:batchId/execution-requests/new"
              element={<ExecutionRequestPage />}
            />
            <Route
              path="/execution-requests/:issueNumber"
              element={<ExecutionRequestDetailPage />}
            />
            <Route
              path="/execution-runs/:runId"
              element={<ExecutionRunDetailPage />}
            />
            <Route path="/runs" element={<ExecutionRunListPage />} />
            <Route
              path="/failures"
              element={<ExecutionRunListPage view="failures" />}
            />
            <Route path="/requests" element={<WorkspaceRequestsPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route
              path="/approvals/registration/:pullNumber"
              element={<RegistrationApprovalDetailPage />}
            />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/lite/setup" element={<LiteSetupPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function ScheduleManagementRedirect() {
  const { batchId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const changeTarget = searchParams.get("change")?.trim();
  const decodedBatchId = decodeURIComponent(batchId);
  const target = new URLSearchParams({ change: decodedBatchId });

  if (changeTarget) {
    target.set("schedule", changeTarget);
  }

  return (
    <Navigate replace to={`/batches/new?${target.toString()}#schedules`} />
  );
}

function NavigationLinks({ variant }: { variant: "desktop" | "mobile" }) {
  const { t } = useTranslation("navigation");

  return (
    <>
      {navSections.map((section) => (
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

function NotFoundPage() {
  const { t } = useTranslation("errors");

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-bp-graphite">
        {t("notFound.title")}
      </h1>
      <p className="mt-2 text-bp-muted">{t("notFound.message")}</p>
    </section>
  );
}
