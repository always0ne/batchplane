import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { writeRuntimeFixtureSelection } from "../../runtime/runtime-fixtures";
import { BatchDetailPage } from "./BatchDetailPage";
import "../../i18n/i18n";

describe("BatchDetailPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders batch detail from mock runtime data", async () => {
    writeRuntimeFixtureSelection("approval-pending");

    renderBatchDetailPage("/batches/payment.daily-close");

    expect(
      await screen.findByRole("heading", { name: "Daily Close" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("payment.daily-close")).toHaveLength(2);
    expect(screen.getByText("Workflow target")).toBeInTheDocument();
    expect(screen.getByText("Execution spec")).toBeInTheDocument();
    expect(
      screen.getByText("GitHub Actions / BatchPlane Lite"),
    ).toBeInTheDocument();
    expect(screen.getByText("echo mock batch")).toBeInTheDocument();
    expect(screen.getByText("Requests")).toBeInTheDocument();
    expect(screen.getByText("Gate required")).toHaveAttribute(
      "title",
      "Mandatory: BatchPlane Gate always runs before the batch command.",
    );
    expect(screen.getByText("Approval required")).toHaveAttribute(
      "title",
      "Execution requests require repository maintainer approval evidence.",
    );
    expect(screen.getByText("Execution request")).toBeInTheDocument();
    expect(screen.getByText("Change request")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Mandatory: BatchPlane Gate always runs before the batch command.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Schedules")).toBeInTheDocument();
    expect(screen.getByText("Daily settlement window")).toBeInTheDocument();
    expect(
      screen.getAllByText("payment.daily-close-daily").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("prod-self-approval-blocked")).toBeInTheDocument();
    expect(screen.getByText("Recent execution evidence")).toBeInTheDocument();
    expect(
      screen.getByText("btr-20260514010100-payment.daily-close-00000001"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request run" })).toHaveAttribute(
      "href",
      "/batches/payment.daily-close/execution-requests/new",
    );
    expect(
      screen.getByRole("link", { name: "Request change" }),
    ).toHaveAttribute("href", "/batches/new?change=payment.daily-close");
    expect(
      screen.getByRole("link", { name: "Register schedule" }),
    ).toHaveAttribute("href", "/batches/payment.daily-close/schedules/new");
  });

  it("renders an empty state when the batch is missing", async () => {
    writeRuntimeFixtureSelection("approval-pending");

    renderBatchDetailPage("/batches/missing.batch");

    expect(
      await screen.findByText("Batch missing.batch was not found."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to batches" }),
    ).toHaveAttribute("href", "/batches");
  });
});

function renderBatchDetailPage(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/batches/:batchId" element={<BatchDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
