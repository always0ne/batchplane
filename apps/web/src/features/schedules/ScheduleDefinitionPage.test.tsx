import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
} from "@batchplane/github-lite";

import "../../i18n/i18n";
import { createGitHubLiteRuntime } from "../../runtime/github-lite-runtime";
import { ApprovalsPage } from "../approvals/ApprovalsPage";
import { ScheduleDefinitionPage } from "./ScheduleDefinitionPage";

const session = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

describe("ScheduleDefinitionPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("creates a governed schedule PR and routes to approvals", async () => {
    const runtime = createRuntime();

    render(
      <MemoryRouter
        initialEntries={["/batches/payment.daily-close/schedules/new"]}
      >
        <Routes>
          <Route
            path="/batches/:batchId/schedules/new"
            element={
              <ScheduleDefinitionPage
                createRuntime={() => runtime}
                readSession={() => session}
              />
            }
          />
          <Route
            path="/approvals"
            element={
              <ApprovalsPage
                createRuntime={() => runtime}
                readSession={() => session}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Register schedule" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Schedule ID"), {
      target: { value: "payment.daily-close-weekly" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Weekly settlement window" },
    });
    fireEvent.change(screen.getByLabelText("Cron"), {
      target: { value: "0 6 * * 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create schedule PR" }));

    expect(screen.getByText("Expected run times")).toBeInTheDocument();
    expect(screen.getByText(/Next 1:/)).toBeInTheDocument();
    expect(await screen.findByText("Governed changes")).toBeInTheDocument();
    expect(
      screen.getByText(/Register schedule payment.daily-close-weekly/),
    ).toBeInTheDocument();
  });

  it("prefills an existing schedule in change mode", async () => {
    const runtime = createRuntime();

    render(
      <MemoryRouter
        initialEntries={[
          "/batches/payment.daily-close/schedules/new?change=payment.daily-close-daily",
        ]}
      >
        <Routes>
          <Route
            path="/batches/:batchId/schedules/new"
            element={
              <ScheduleDefinitionPage
                createRuntime={() => runtime}
                readSession={() => session}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Change schedule" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("payment.daily-close-daily").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByDisplayValue("Daily settlement window"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("0 5 * * *")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Asia/Seoul")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create change PR" }),
    ).toBeInTheDocument();
  });
});

function createRuntime() {
  const client = createMockGitHubLiteClient(createGitHubLiteMockState());

  return createGitHubLiteRuntime(session, { client });
}
