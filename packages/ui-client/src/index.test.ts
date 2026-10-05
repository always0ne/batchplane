import {
  type BatchListError,
  type BatchListItem,
  type BatchListResult,
} from "./index";
import { describe, expectTypeOf, it } from "vitest";

describe("ui client contract", () => {
  it("type-level: exposes connection, error, and loaded list outcomes without workflow storage", () => {
    expectTypeOf<BatchListResult>().toEqualTypeOf<
      | { type: "workspace-not-connected" }
      | { error: BatchListError; type: "error" }
      | { batches: BatchListItem[]; sourceRevision: string; type: "loaded" }
    >();
    expectTypeOf<BatchListItem>().not.toHaveProperty("workflow");
  });
});
