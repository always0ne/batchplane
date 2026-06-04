import { describe, expect, it } from "vitest";

import { getCronPreview } from "./cron-preview";

describe("getCronPreview", () => {
  it("returns stable error codes for validation failures", () => {
    expect(getCronPreview("", "Asia/Seoul")).toEqual({
      errorCode: "cronRequired",
      ok: false,
    });
    expect(getCronPreview("0 9 * * *", "")).toEqual({
      errorCode: "timezoneRequired",
      ok: false,
    });
    expect(getCronPreview("0 9 * * *", "Mars/Seoul")).toEqual({
      errorCode: "invalidTimezone",
      ok: false,
    });
    expect(getCronPreview("not cron", "Asia/Seoul")).toEqual({
      errorCode: "invalidCron",
      ok: false,
    });
  });

  it("returns upcoming run dates for valid cron and timezone input", () => {
    const preview = getCronPreview(
      "0 9 * * *",
      "Asia/Seoul",
      2,
      new Date("2026-05-13T00:00:00.000Z"),
    );

    expect(preview.ok).toBe(true);
    expect(
      preview.ok ? preview.dates.map((date) => date.toISOString()) : [],
    ).toEqual(["2026-05-14T00:00:00.000Z", "2026-05-15T00:00:00.000Z"]);
  });
});
