import { GitBranch } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { RuntimeFixtureId } from "../runtime/runtime-fixtures";
import { AppNavigation } from "./AppNavigation";
import { LanguageSelector } from "./LanguageSelector";
import { RuntimeFixtureSwitcher } from "./RuntimeFixtureSwitcher";

const compactMarkSrc = `${import.meta.env.BASE_URL}assets/batchplane-compact-mark.svg`;

type AppShellProps = {
  children: ReactNode;
  onRuntimeFixtureChange: (fixtureId: RuntimeFixtureId) => void;
  runtimeFixture: RuntimeFixtureId;
};

export function AppShell({
  children,
  onRuntimeFixtureChange,
  runtimeFixture,
}: AppShellProps) {
  const { t } = useTranslation(["common", "navigation"]);

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
          <AppNavigation variant="desktop" />
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
              <RuntimeFixtureSwitcher
                fixtureId={runtimeFixture}
                onChange={onRuntimeFixtureChange}
              />
              <LanguageSelector />
            </div>
          </div>
          <nav
            aria-label={t("navigation:landmarks.mobilePrimary")}
            className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden"
          >
            <AppNavigation variant="mobile" />
          </nav>
        </header>
        <div className="p-4 sm:p-5" key={runtimeFixture}>
          {children}
        </div>
      </main>
    </div>
  );
}
