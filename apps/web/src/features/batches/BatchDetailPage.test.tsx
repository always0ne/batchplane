import { fireEvent, render, screen } from "@testing-library/react";
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
      screen.getByText("GitHub Actions / BatchTrail Repo Mode"),
    ).toBeInTheDocument();
    expect(screen.getByText("echo mock batch")).toBeInTheDocument();
    expect(screen.getByText("Requests")).toBeInTheDocument();
    expect(screen.getByText("Gate required")).toHaveAttribute(
      "title",
      "Mandatory: BatchTrail Gate always runs before the batch command.",
    );
    expect(screen.getByText("Approval required")).toHaveAttribute(
      "title",
      "Execution requests require repository maintainer approval evidence.",
    );
    expect(screen.getByText("Execution request")).toBeInTheDocument();
    expect(screen.getByText("Change request")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Mandatory: BatchTrail Gate always runs before the batch command.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Schedules")).toBeInTheDocument();
    expect(screen.getByText("Recent execution evidence")).toBeInTheDocument();
    expect(
      screen.getByText("btr-20260514010100-payment.daily-close-00000001"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Reason")).toHaveValue(
      "Manual request from BatchTrail Repo Mode.",
    );
    expect(
      screen.getByRole("link", { name: "Request change" }),
    ).toHaveAttribute("href", "/batches/new?change=payment.daily-close");
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

  it("updates the execution request reason field", async () => {
    writeRuntimeFixtureSelection("approval-pending");

    renderBatchDetailPage("/batches/payment.daily-close");

    const reason = await screen.findByLabelText("Reason");

    fireEvent.change(reason, {
      target: { value: "Close payments after upstream reconciliation." },
    });

    expect(reason).toHaveValue("Close payments after upstream reconciliation.");
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
