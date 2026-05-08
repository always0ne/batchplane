import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import { detectLocale, readStoredLocale } from "./locale-detector";
import { defaultLocale } from "./locales";
import { defaultNamespace, namespaces, resources } from "./resources";

const browserLocales =
  typeof navigator === "undefined"
    ? []
    : [
        navigator.language,
        ...(Array.from(navigator.languages ?? []) as string[]),
      ];

export const initialLocale = detectLocale({
  browserLocales,
  storedLocale: typeof window === "undefined" ? null : readStoredLocale(),
});

void i18next.use(initReactI18next).init({
  defaultNS: defaultNamespace,
  fallbackLng: defaultLocale,
  interpolation: {
    escapeValue: false,
  },
  lng: initialLocale,
  ns: namespaces,
  resources,
  supportedLngs: Object.keys(resources),
});

export { i18next };
