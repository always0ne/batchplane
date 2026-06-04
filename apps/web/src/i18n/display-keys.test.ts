import { describe, expect, it } from "vitest";

import {
  gateReasonCodes,
  formatGateReasonDisplay,
  getGateReasonDisplayKey,
  getStatusDisplayKey,
  statusDisplayGroups,
} from "./display-keys";
import { resources } from "./resources";

describe("display key resources", () => {
  it("resolves every domain status display key in English and Korean", () => {
    for (const [group, values] of Object.entries(statusDisplayGroups)) {
      for (const value of values) {
        expect(
          getResourceValue(resources.en.common, `status.${group}.${value}`),
          `${group}.${value} en`,
        ).toBeTypeOf("string");
        expect(
          getResourceValue(resources.ko.common, `status.${group}.${value}`),
          `${group}.${value} ko`,
        ).toBeTypeOf("string");
        expect(
          getStatusDisplayKey(group as keyof typeof statusDisplayGroups, value),
        ).toBe(`common:status.${group}.${value}`);
      }
    }
  });

  it("resolves every Gate and dispatcher reason code in English and Korean", () => {
    for (const reasonCode of gateReasonCodes) {
      expect(
        getResourceValue(resources.en.errors, `gate.reasonCodes.${reasonCode}`),
        `${reasonCode} en`,
      ).toBeTypeOf("string");
      expect(
        getResourceValue(resources.ko.errors, `gate.reasonCodes.${reasonCode}`),
        `${reasonCode} ko`,
      ).toBeTypeOf("string");
    }
  });

  it("falls back unknown reason codes to the UNKNOWN display resource", () => {
    expect(getGateReasonDisplayKey("SOMETHING_NEW")).toBe(
      "errors:gate.reasonCodes.UNKNOWN",
    );
    expect(
      formatGateReasonDisplay("SOMETHING_NEW", (key) => key, "fallback"),
    ).toBe("SOMETHING_NEW - errors:gate.reasonCodes.UNKNOWN");
  });

  it("preserves Gate reason code identifiers while displaying localized text", () => {
    expect(
      formatGateReasonDisplay(
        "RERUN_NOT_AUTHORIZED",
        (key) =>
          String(
            getResourceValue(resources.en.errors, key.replace("errors:", "")),
          ),
        "fallback",
      ),
    ).toBe("RERUN_NOT_AUTHORIZED - GitHub Actions rerun is not authorized.");
  });
});

function getResourceValue(tree: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, tree);
}
