import { inspectionTestClient } from "../../test/inspection-client";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { RuntimeClientTestProvider } from "../../test/RuntimeClientTestProvider";

import "../../i18n/i18n";
import { writeRuntimeFixtureSelection } from "../../runtime/runtime-fixtures";
import { DashboardPage } from "./DashboardPage";

describe("DashboardPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders dashboard summary from mock fixture data", async () => {
    writeRuntimeFixtureSelection("gate-blocked");

    render(
      <MemoryRouter>
        <RuntimeClientTestProvider>
          <DashboardPage />
        </RuntimeClientTestProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Connected Workspace" }),
    ).toBeInTheDocument();
    expect(screen.getByText("always0ne/batch")).toBeInTheDocument();
    expect(screen.getByText("Workspace readiness")).toBeInTheDocument();
    expect(screen.getByText("Gate blocked executions")).toBeInTheDocument();
    expect(
      screen.getByText("Gate blocked executions").closest("a"),
    ).toHaveAttribute("href", "/executions/failures?type=blocked");
    expect(screen.getByText("Failed executions").closest("a")).toHaveAttribute(
      "href",
      "/executions/failures?type=failed",
    );
    expect(
      screen.getByText("Gate evidence, not approval work"),
    ).toBeInTheDocument();
    expect(screen.getByText("Recent audit trail")).toBeInTheDocument();
    expect(screen.getByText("Audit trail").closest("a")).toHaveAttribute(
      "href",
      "/audit",
    );
  });

  it("renders an empty state when no runtime session is available", async () => {
    render(
      <MemoryRouter>
        <RuntimeClientTestProvider readSession={() => null}>
          <DashboardPage />
        </RuntimeClientTestProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        "Connect a Workspace to view Lite control status.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Workspace" }),
    ).toHaveAttribute("href", "/workspace");
  });

  it("renders an error state when dashboard loading fails", async () => {
    const runtime = inspectionTestClient({
      getDashboardSummary: async () => {
        throw new Error("Dashboard failed");
      },
    });

    render(
      <MemoryRouter>
        <RuntimeClientTestProvider
          createClient={() => runtime}
          readSession={() => ({
            owner: "always0ne",
            repo: "batch",
            token: "fixture-token",
          })}
        >
          <DashboardPage />
        </RuntimeClientTestProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dashboard failed",
    );
  });
});
