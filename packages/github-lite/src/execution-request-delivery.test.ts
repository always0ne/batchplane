import { describe, expect, it } from "vitest";
import { withObservedExecutionDelivery } from "./execution-request-delivery.js";

describe("observed execution delivery", () => {
  it("settles only uncertain delivery from explicit request correlation, preserving terminal history", () => {
    const request = {
      requestId: "request-1",
      triggerType: "MANUAL" as const,
      status: "DISPATCH_UNCONFIRMED" as const,
    };
    expect(withObservedExecutionDelivery(request, [])).toBe(request);
    expect(
      withObservedExecutionDelivery(request, [{ observedRequestId: "other" }]),
    ).toBe(request);
    expect(
      withObservedExecutionDelivery(request, [
        { observedRequestId: "request-1", gateDecision: { allowed: false } },
      ]),
    ).toBe(request);
    const observed = [{ observedRequestId: "request-1" }];
    expect(withObservedExecutionDelivery(request, observed).status).toBe(
      "DISPATCHED",
    );
    expect(
      withObservedExecutionDelivery(
        { ...request, status: "DISPATCHING" },
        observed,
      ).status,
    ).toBe("DISPATCHED");
    for (const status of ["DISPATCH_FAILED", "EXPIRED"] as const) {
      const terminal = { ...request, status };
      expect(withObservedExecutionDelivery(terminal, observed)).toBe(terminal);
    }
    const scheduled = { ...request, triggerType: "SCHEDULE" as const };
    expect(withObservedExecutionDelivery(scheduled, observed)).toBe(scheduled);
  });
});
