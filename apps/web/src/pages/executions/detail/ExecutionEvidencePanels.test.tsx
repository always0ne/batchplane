import type { ExecutionRunPresentation } from "@batchplane/ui-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { i18next } from "../../../i18n/i18n";
import {
  BusinessOutcomePanel,
  GateOutcomePanel,
} from "./ExecutionEvidencePanels";

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

  it.each([
    [
      "CANCELED",
      undefined,
      "Business execution status: Canceled.",
      "text-slate-500",
    ],
    [
      "FAILED",
      undefined,
      "The workflow failed, but Gate verification is unknown. BatchPlane cannot classify this as a business failure.",
      "text-sky-700",
    ],
    [
      "FAILED",
      allowedGate,
      "The batch command or business job failed after Gate allowed the run.",
      "text-red-700",
    ],
    ["QUEUED", undefined, "Business execution status: Queued.", "text-sky-700"],
    [
      "RUNNING",
      undefined,
      "Business execution status: Running.",
      "text-sky-700",
    ],
  ] as const)(
    "shows %s with the existing business message and icon color",
    (status, gateDecision, message, iconClass) => {
      render(
        <BusinessOutcomePanel run={{ ...baseRun, gateDecision, status }} />,
      );
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Business execution" })
          .previousElementSibling,
      ).toHaveClass(iconClass);
    },
  );

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
