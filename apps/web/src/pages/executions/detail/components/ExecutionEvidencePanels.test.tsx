import type { ExecutionRunPresentation } from "@batchplane/ui-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { i18next } from "../../../../i18n/i18n";
import { BusinessOutcomePanel } from "./BusinessOutcomePanel";
import { GateOutcomePanel } from "./GateOutcomePanel";

const baseRun: ExecutionRunPresentation = {
  batchId: "payment.daily-close",
  requestId: "request-1",
  runId: "run-1",
  status: "RUNNING",
};

const allowedGate = {
  allowed: true,
  decidedAt: "2026-09-11T00:00:00.000Z",
  message: "Allowed",
};

describe("execution evidence panels", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("shows the queued business outcome when Gate evidence is unavailable", () => {
    render(<BusinessOutcomePanel run={{ ...baseRun, status: "QUEUED" }} />);

    expect(
      screen.getByText("Business execution status: Queued."),
    ).toBeInTheDocument();
  });

  it("prioritizes source-run wording over a blocked business outcome", () => {
    render(
      <BusinessOutcomePanel
        run={{ ...baseRun, evidenceScope: "SOURCE_RUN", status: "BLOCKED" }}
      />,
    );
    expect(
      screen.getByText(
        "This source run is not correlated with a recorded schedule occurrence. Its jobs and logs are available, but no business result is attributed.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "The batch command did not run because Gate blocked execution.",
      ),
    ).not.toBeInTheDocument();
  });

  it("keeps blocked Gate display ahead of allowed evidence", () => {
    render(
      <GateOutcomePanel
        run={{ ...baseRun, gateDecision: allowedGate, status: "BLOCKED" }}
      />,
    );
    expect(
      screen.getByText(
        "Gate blocked this run before the batch command. Treat this separately from business failure.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Gate allowed this run before the batch command."),
    ).not.toBeInTheDocument();
  });
});
