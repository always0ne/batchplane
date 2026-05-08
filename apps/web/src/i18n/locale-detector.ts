import {
  defaultLocale,
  isSupportedLocale,
  type SupportedLocale,
} from "./locales";

const localeStorageKey = "batchtrail.locale";

export function normalizeLocale(
  locale: string | null | undefined,
): SupportedLocale | null {
  if (!locale) {
    return null;
  }

  const normalized = locale.toLowerCase();
  if (isSupportedLocale(normalized)) {
    return normalized;
  }

  const [primaryLanguage] = normalized.split("-");
  if (primaryLanguage && isSupportedLocale(primaryLanguage)) {
    return primaryLanguage;
  }

  return null;
}

export function detectLocale(options: {
  explicitLocale?: string | null;
  browserLocales?: readonly string[];
  storedLocale?: string | null;
}): SupportedLocale {
  const candidates = [
    options.explicitLocale,
    options.storedLocale,
    ...(options.browserLocales ?? []),
  ];

  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate);
    if (locale) {
      return locale;
    }
  }

  return defaultLocale;
}

export function readStoredLocale(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): SupportedLocale | null {
  return normalizeLocale(storage.getItem(localeStorageKey));
}

export function writeStoredLocale(
  locale: SupportedLocale,
  storage: Pick<Storage, "setItem"> = window.localStorage,
): void {
  storage.setItem(localeStorageKey, locale);
}

export { localeStorageKey };
