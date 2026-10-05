import { useTranslation } from "react-i18next";

export function NotFoundPage() {
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
