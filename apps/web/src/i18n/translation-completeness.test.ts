import { describe, expect, it } from "vitest";

import { flattenKeys } from "./translation-utils";
import { resources } from "./resources";

describe("translation resources", () => {
  it("keeps Korean keys aligned with English keys", () => {
    for (const namespace of Object.keys(resources.en) as Array<
      keyof typeof resources.en
    >) {
      const englishKeys = flattenKeys(resources.en[namespace]).sort();
      const koreanKeys = flattenKeys(resources.ko[namespace]).sort();

      expect(koreanKeys, namespace).toEqual(englishKeys);
    }
  });
});
