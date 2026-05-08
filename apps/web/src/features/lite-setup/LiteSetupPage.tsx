import { useTranslation } from "react-i18next";

import { PageHeader } from "../../shared/components/PageHeader";

export function LiteSetupPage() {
  const { t } = useTranslation(["settings", "common"]);

  return (
    <section>
      <PageHeader
        title={t("settings:title")}
        subtitle={t("settings:subtitle")}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-bt-graphite">
            {t("settings:language")}
          </h2>
          <p className="mt-2 text-sm text-bt-muted">
            {t("common:app.tagline")}
          </p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-bt-graphite">GitHub</h2>
          <p className="mt-2 text-sm text-bt-muted">
            {t("settings:tokenPolicy")}
          </p>
        </article>
      </div>
    </section>
  );
}
