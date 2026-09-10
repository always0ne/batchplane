import { useTranslation } from "react-i18next";

import { writeStoredLocale } from "../i18n/locale-detector";
import {
  localeLabels,
  supportedLocales,
  type SupportedLocale,
} from "../i18n/locales";

export function LanguageSelector() {
  const { i18n, t } = useTranslation("settings");
  const language = i18n.resolvedLanguage ?? i18n.language;
  const activeLocale =
    supportedLocales.find((locale) => language.startsWith(locale)) ?? "en";

  function changeLocale(locale: SupportedLocale) {
    writeStoredLocale(locale);
    void i18n.changeLanguage(locale);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-bp-muted">
      <span>{t("language")}</span>
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
  );
}
