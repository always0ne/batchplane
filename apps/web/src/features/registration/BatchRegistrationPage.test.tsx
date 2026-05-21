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

    expect(await screen.findByText("Registration changes")).toBeInTheDocument();
    expect(
      screen.getByText(/Register batch settlement.daily-rollup/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open PR" }).getAttribute("href"),
    ).toContain("https://github.com/always0ne/batch/pull/");
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
