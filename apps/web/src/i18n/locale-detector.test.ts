import { beforeEach, describe, expect, it } from "vitest";

import {
  detectLocale,
  legacyLocaleStorageKey,
  normalizeLocale,
  readStoredLocale,
} from "./locale-detector";

describe("locale detection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("resolves ko-KR to ko", () => {
    expect(normalizeLocale("ko-KR")).toBe("ko");
  });

  it("falls back to English for unsupported browser locales", () => {
    expect(detectLocale({ browserLocales: ["ja-JP"] })).toBe("en");
  });

  it("prefers explicit locale over browser locale", () => {
    expect(
      detectLocale({ browserLocales: ["ko-KR"], explicitLocale: "en" }),
    ).toBe("en");
  });

  it("reads legacy BatchTrail locale storage keys", () => {
    localStorage.setItem(legacyLocaleStorageKey, "ko");

    expect(readStoredLocale()).toBe("ko");
  });
});
