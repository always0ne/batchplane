import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { writeRuntimeFixtureSelection } from "../../runtime/runtime-fixtures";
import "../../i18n/i18n";
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
});
