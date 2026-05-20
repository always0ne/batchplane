import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import "../../i18n/i18n";
import { ApprovalsPage } from "../approvals/ApprovalsPage";
import { writeRuntimeFixtureSelection } from "../../runtime/runtime-fixtures";
import { ExecutionRequestPage } from "./ExecutionRequestPage";

describe("ExecutionRequestPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("previews an execution request without persisting sensitive values", async () => {
    writeRuntimeFixtureSelection("happy-path");

    renderExecutionRequestPage();

    expect(
      await screen.findByRole("heading", { name: "Execution request" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Request review")).toBeInTheDocument();
    expect(screen.getByText("Canonical payload")).toBeInTheDocument();
    expect(
      screen.getByText(
        "BatchTrail Gate is mandatory before the batch command.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "apiToken" },
    });
    fireEvent.change(screen.getByLabelText("Value"), {
      target: { value: "super-secret-token" },
    });
    fireEvent.click(screen.getByLabelText("Sensitive"));

    await waitFor(() => {
      expect(document.body.textContent).toContain("valueDigest");
    });
    expect(document.body.textContent).toContain("apiToken");
    expect(document.body.textContent).not.toContain("super-secret-token");
    expect(screen.getAllByText(/sha256:/).length).toBeGreaterThan(0);
  });

  it("creates a mock Issue and routes the request to approvals", async () => {
    writeRuntimeFixtureSelection("happy-path");

    renderExecutionRequestPage();

    expect(
      await screen.findByRole("heading", { name: "Execution request" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Close payments after upstream reconciliation." },
    });
    const createButton = await screen.findByRole("button", {
      name: "Create execution request",
    });
    await waitFor(() => {
      expect(createButton).toBeEnabled();
    });
    fireEvent.click(createButton);

    expect(await screen.findByText("Execution requests")).toBeInTheDocument();
    expect(
      screen.getByText(/Run batch payment.daily-close/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Issue" })).toHaveAttribute(
      "href",
      expect.stringContaining("https://github.com/always0ne/batch/issues/"),
    );
  });
});

function renderExecutionRequestPage() {
  render(
    <MemoryRouter
      initialEntries={["/batches/payment.daily-close/execution-requests/new"]}
    >
      <Routes>
        <Route
          path="/batches/:batchId/execution-requests/new"
          element={<ExecutionRequestPage />}
        />
        <Route path="/approvals" element={<ApprovalsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
