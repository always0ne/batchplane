import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import "../../i18n/i18n";
import { ApprovalsPage } from "../approvals/ApprovalsPage";
import { writeRuntimeFixtureSelection } from "../../runtime/runtime-fixtures";
import { BatchRegistrationPage } from "./BatchRegistrationPage";

describe("BatchRegistrationPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders a PR review panel and YAML preview from form input", async () => {
    renderRegistrationPage();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Add schedule" }));
    fireEvent.change(screen.getByLabelText("Schedule ID"), {
      target: { value: "payment.daily-close-daily" },
    });
    fireEvent.change(screen.getAllByLabelText("Name")[1]!, {
      target: { value: "Daily settlement window" },
    });
    expect(screen.queryByText(/new-batch/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Batch command"), {
      target: { value: "./scripts/daily-close.sh" },
    });

    expect(screen.getByText("PR review")).toBeInTheDocument();
    expect(screen.getByText("Generated files")).toBeInTheDocument();
    expect(screen.getByText("Governance checklist")).toBeInTheDocument();
    expect(screen.getByText("No uploaded execution file")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Batch command will be recorded in the batch definition.",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findAllByText(/payment.daily-close.yml/),
    ).not.toHaveLength(0);
    expect(screen.getByText(/id: "payment.daily-close"/)).toBeInTheDocument();
    expect(
      screen.getByText(/path: ".github\/workflows\/payment.daily-close.yml"/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("BatchPlane Gate always runs before the batch command."),
    ).toBeInTheDocument();
    expect(screen.getByText("Schedule definitions")).toBeInTheDocument();
    expect(screen.getByText("Expected run times")).toBeInTheDocument();
    expect(screen.getByText(/Next 1:/)).toBeInTheDocument();
    expect(
      screen.getAllByText(
        ".batch-governance/schedules/payment.daily-close-daily.yml",
      ).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Workflow YAML"));

    expect(screen.getByText(/workflow_dispatch:/)).toBeInTheDocument();
    expect(screen.getByText(/batchplane-gate:/)).toBeInTheDocument();
    expect(screen.getByText(/runs-on: "ubuntu-latest"/)).toBeInTheDocument();
    expect(screen.getAllByText(/.\/scripts\/daily-close.sh/)).not.toHaveLength(
      0,
    );
  });

  it("routes a created mock PR to approvals with the resulting PR link", async () => {
    writeRuntimeFixtureSelection("happy-path");
    render(
      <MemoryRouter initialEntries={["/batches/new"]}>
        <Routes>
          <Route path="/batches/new" element={<BatchRegistrationPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredFields("settlement.daily-rollup");
    fireEvent.change(screen.getByLabelText("Batch command"), {
      target: { value: "./scripts/settlement-rollup.sh" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create registration PR" }),
    );

    expect(await screen.findByText("Governed changes")).toBeInTheDocument();
    expect(
      screen.getByText(/Register batch settlement.daily-rollup/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open PR" }).getAttribute("href"),
    ).toContain("https://github.com/always0ne/batch/pull/");
  });

  it("prefills the existing batch when opened in change mode", async () => {
    writeRuntimeFixtureSelection("approval-pending");

    render(
      <MemoryRouter
        initialEntries={["/batches/new?change=payment.daily-close"]}
      >
        <Routes>
          <Route path="/batches/new" element={<BatchRegistrationPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Change request" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("payment.daily-close").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByDisplayValue("Daily Close")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ops-team")).toBeInTheDocument();
    expect(screen.getByDisplayValue("payments")).toBeInTheDocument();
    expect(screen.getByDisplayValue("echo mock batch")).toBeInTheDocument();
    expect(screen.getByText("payment.daily-close-daily")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Daily settlement window"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create change PR" }),
    ).toBeInTheDocument();
  });

  it("keeps an existing schedule visible when marked for deletion", async () => {
    writeRuntimeFixtureSelection("approval-pending");

    render(
      <MemoryRouter
        initialEntries={["/batches/new?change=payment.daily-close"]}
      >
        <Routes>
          <Route path="/batches/new" element={<BatchRegistrationPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Change request" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByText("Pending delete")).toBeInTheDocument();
    expect(
      screen.getByText(
        "If this change request is merged, this schedule definition file will be removed from the repository.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Scheduled removals")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        ".batch-governance/schedules/payment.daily-close-daily.yml",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Undo delete" }),
    ).toBeInTheDocument();
  });
});

function renderRegistrationPage() {
  render(
    <MemoryRouter>
      <BatchRegistrationPage />
    </MemoryRouter>,
  );
}

function fillRequiredFields(batchId = "payment.daily-close") {
  fireEvent.change(screen.getByLabelText("Batch ID"), {
    target: { value: batchId },
  });
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Daily Close" },
  });
  fireEvent.change(screen.getByLabelText("Owner"), {
    target: { value: "ops-team" },
  });
  fireEvent.change(screen.getByLabelText("Domain"), {
    target: { value: "payments" },
  });
}
