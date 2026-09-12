import { describe, expect, it } from "vitest";

import {
  nativeScheduleExecutionLocator,
  parseNativeScheduleExecutionLocator,
} from "./native-schedule-projections.js";

describe("native schedule execution locators", () => {
  it("keeps schedules in one native Run distinct through their request identity", () => {
    const first = nativeScheduleExecutionLocator({
      requestId: "btr-schedule-ae3b8e",
      runAttempt: 1,
      sourceRunId: "9051",
    });
    const second = nativeScheduleExecutionLocator({
      requestId: "btr-schedule-91f7c2",
      runAttempt: 1,
      sourceRunId: "9051",
    });

    expect(first).not.toBe(second);
    expect(parseNativeScheduleExecutionLocator(first)).toEqual({
      requestId: "btr-schedule-ae3b8e",
      runAttempt: 1,
      sourceRunId: "9051",
    });
  });

  it("retains a native Run's historical attempt in its detail identity", () => {
    const attemptOne = nativeScheduleExecutionLocator({
      requestId: "btr-schedule-ae3b8e",
      runAttempt: 1,
      sourceRunId: "9051",
    });
    const attemptTwo = nativeScheduleExecutionLocator({
      requestId: "btr-schedule-ae3b8e",
      runAttempt: 2,
      sourceRunId: "9051",
    });

    expect(attemptOne).not.toBe(attemptTwo);
    expect(parseNativeScheduleExecutionLocator(attemptTwo)?.runAttempt).toBe(2);
    expect(parseNativeScheduleExecutionLocator("9051")).toBeNull();
  });
});
