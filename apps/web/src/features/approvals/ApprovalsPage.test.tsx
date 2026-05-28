import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { writeRuntimeFixtureSelection } from "../../runtime/runtime-fixtures";
import "../../i18n/i18n";
import { saveExecutionApprovalHandoff } from "./approval-handoff";
import { ApprovalsPage } from "./ApprovalsPage";

describe("ApprovalsPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("shows execution judgment context for approval-actionable requests", async () => {
    writeRuntimeFixtureSelection("approval-pending");

    render(
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Execution requests")).toBeInTheDocument();
    expect(screen.getByText("Execution context")).toBeInTheDocument();
    expect(screen.getByText("echo mock batch")).toBeInTheDocument();
    expect(screen.getByText("ubuntu-latest")).toBeInTheDocument();
    expect(
      screen.getByText(".github/workflows/payment.daily-close.yml@main"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve execution" }),
    ).toBeInTheDocument();
  });

  it.each(["dispatch-failed", "gate-blocked"] as const)(
    "does not show %s evidence as approval work",
    async (fixture) => {
      writeRuntimeFixtureSelection(fixture);

      render(
        <MemoryRouter>
          <ApprovalsPage />
        </MemoryRouter>,
      );

      expect(
        await screen.findByText("No approvals are pending on main."),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Approve execution" }),
      ).not.toBeInTheDocument();
    },
  );

  it("shows a stored execution handoff while GitHub lists lag", async () => {
    writeRuntimeFixtureSelection("dispatch-failed");
    saveExecutionApprovalHandoff({
      author: "developer",
      body: [
        "## BatchPlane Execution Request",
        "",
        "- Request ID: `btr-20260509010203-settlement.daily-rollup-abcdef12`",
        "- Batch ID: `settlement.daily-rollup`",
        "- Requested by: @developer",
        "- Requested at: 2026-05-09T01:02:03.000Z",
        "- Expires at: 2026-05-09T02:02:03.000Z",
        "- Request digest: `sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`",
        "- Status: REQUESTED",
        "",
        "<!-- batchplane:execution-request",
        "requestId=btr-20260509010203-settlement.daily-rollup-abcdef12",
        "batchId=settlement.daily-rollup",
        "requestDigest=sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "status=REQUESTED",
        "-->",
      ].join("\n"),
      isPullRequest: false,
      labels: ["batchplane:execution-request"],
      number: 901,
      state: "open",
      title: "Run batch settlement.daily-rollup",
      url: "https://github.com/always0ne/batch/issues/901",
    });

    render(
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Execution requests")).toBeInTheDocument();
    expect(
      screen.getByText(/Run batch settlement.daily-rollup/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Issue" })).toHaveAttribute(
      "href",
      "https://github.com/always0ne/batch/issues/901",
    );
  });
});
