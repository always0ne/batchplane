import { render, screen } from "@testing-library/react";
import type { BatchPlaneRuntimePorts } from "@batchplane/domain";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { writeRuntimeFixtureSelection } from "../../runtime/runtime-fixtures";
import { DashboardPage } from "./DashboardPage";
import "../../i18n/i18n";

describe("DashboardPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders dashboard summary from mock fixture data", async () => {
    writeRuntimeFixtureSelection("gate-blocked");

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Connected repository" }),
    ).toBeInTheDocument();
    expect(screen.getByText("always0ne/batch")).toBeInTheDocument();
    expect(screen.getByText("Repository readiness")).toBeInTheDocument();
    expect(screen.getByText("Gate blocked runs")).toBeInTheDocument();
    expect(screen.getByText("Gate blocked runs").closest("a")).toHaveAttribute(
      "href",
      "/runs?type=blocked",
    );
    expect(screen.getByText("Failed runs").closest("a")).toHaveAttribute(
      "href",
      "/runs?type=failed",
    );
    expect(
      screen.getByText("Gate evidence, not approval work"),
    ).toBeInTheDocument();
    expect(screen.getByText("Recent audit trail")).toBeInTheDocument();
    expect(
      screen.getByText("No audit records are available yet."),
    ).toBeInTheDocument();
  });

  it("renders an empty state when no runtime session is available", async () => {
    render(
      <MemoryRouter>
        <DashboardPage readSession={() => null} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        "Connect a GitHub repository to view Lite control status.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open setup" })).toHaveAttribute(
      "href",
      "/lite/setup",
    );
  });

  it("renders an error state when dashboard loading fails", async () => {
    const runtime = {
      settings: {
        getCurrentUser: async () => {
          throw new Error("Dashboard failed");
        },
        getRepository: async () => ({
          defaultBranch: "main",
          owner: "always0ne",
          private: true,
          repo: "batch",
          url: "https://github.com/always0ne/batch",
        }),
      },
    } as unknown as BatchPlaneRuntimePorts;

    render(
      <MemoryRouter>
        <DashboardPage
          createRuntime={() => runtime}
          readSession={() => ({
            owner: "always0ne",
            repo: "batch",
            token: "fixture-token",
          })}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dashboard failed",
    );
  });
});
