import {
  ClipboardCheck,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  Settings,
} from "lucide-react";
import { useMemo } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BatchesPage } from "../features/batches/BatchesPage";
import { ApprovalsPage } from "../features/approvals/ApprovalsPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { LiteSetupPage } from "../features/lite-setup/LiteSetupPage";
import { BatchRegistrationPage } from "../features/registration/BatchRegistrationPage";
import {
  localeLabels,
  supportedLocales,
  type SupportedLocale,
} from "../i18n/locales";
import { writeStoredLocale } from "../i18n/locale-detector";

const navItems = [
  { icon: LayoutDashboard, labelKey: "items.dashboard", to: "/dashboard" },
  { icon: Settings, labelKey: "items.setup", to: "/lite/setup" },
  { icon: ListChecks, labelKey: "items.batches", to: "/batches" },
  { icon: ClipboardCheck, labelKey: "items.approvals", to: "/approvals" },
] as const;

export function App() {
  const { i18n, t } = useTranslation(["common", "navigation"]);

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

  return (
    <div className="min-h-screen bg-bt-surface">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-200 bg-white p-5 lg:block">
        <div className="flex items-center gap-3">
          <img
            src="/assets/batchtrail-compact-mark.svg"
            alt=""
            className="h-11 w-11 rounded-xl"
          />
          <div>
            <p className="text-lg font-bold text-bt-graphite">
              {t("common:app.name")}
            </p>
            <p className="text-sm font-medium text-bt-git">
              {t("common:app.edition")}
            </p>
          </div>
        </div>
        <nav className="mt-8 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold",
                    isActive
                      ? "bg-bt-control text-white"
                      : "text-bt-muted hover:bg-slate-100 hover:text-bt-graphite",
                  ].join(" ")
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {t(`navigation:${item.labelKey}`)}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <main className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-bt-muted">
              <GitBranch className="h-4 w-4 text-bt-git" aria-hidden="true" />
              {t("common:app.tagline")}
            </div>
            <label className="flex items-center gap-2 text-sm text-bt-muted">
              <span>{t("settings:language")}</span>
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-bt-graphite"
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
        </header>
        <div className="p-5">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/batches" element={<BatchesPage />} />
            <Route path="/batches/new" element={<BatchRegistrationPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/lite/setup" element={<LiteSetupPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function NotFoundPage() {
  const { t } = useTranslation("errors");

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-bt-graphite">
        {t("notFound.title")}
      </h1>
      <p className="mt-2 text-bt-muted">{t("notFound.message")}</p>
    </section>
  );
}
