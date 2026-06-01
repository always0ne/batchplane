import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";
import "../i18n/i18n";

describe("App", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it.each([
    { heading: "Dashboard", path: "/dashboard" },
    { heading: "My Work", path: "/my-work" },
    { heading: "Workspace", path: "/lite/setup" },
    { heading: "Batches", path: "/batches" },
    { heading: "Registration", path: "/batches/new" },
    { heading: "Executions", path: "/runs" },
    { heading: "Failures", path: "/failures" },
    { heading: "Approvals", path: "/approvals" },
    { heading: "Audit Trail", path: "/audit" },
  ])("renders the $path route", async ({ heading, path }) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: heading }),
    ).toBeInTheDocument();
    expect(screen.getByText("BatchPlane")).toBeInTheDocument();
  });

  it("redirects the root route to the dashboard", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
  });

  it("redirects direct schedule routes into the batch change request flow", async () => {
    render(
      <MemoryRouter
        initialEntries={["/batches/payment.daily-close/schedules/new"]}
      >
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Change request" }),
    ).toBeInTheDocument();
  });

  it("renders the execution run detail route with the development fixture", async () => {
    sessionStorage.setItem("batchplane.dev.runtimeFixture", "happy-path");

    render(
      <MemoryRouter initialEntries={["/execution-runs/204"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Execution run detail" }),
    ).toBeInTheDocument();
  });

  it("renders a not found state for unknown routes", async () => {
    render(
      <MemoryRouter initialEntries={["/unknown"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });

  it("renders the development runtime fixture switcher", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Fixture")).toHaveValue("live");
    expect(screen.getByRole("option", { name: "Happy path" })).toHaveValue(
      "happy-path",
    );
    expect(
      screen.getByRole("option", { name: "Approval pending" }),
    ).toHaveValue("approval-pending");
    expect(screen.getByRole("option", { name: "Business failed" })).toHaveValue(
      "business-failed",
    );
    expect(screen.getByRole("option", { name: "Dispatch failed" })).toHaveValue(
      "dispatch-failed",
    );
    expect(screen.getByRole("option", { name: "Gate blocked" })).toHaveValue(
      "gate-blocked",
    );
  });

  it.each([
    { height: 800, name: "mobile", width: 375 },
    { height: 900, name: "desktop", width: 1280 },
  ])("keeps the app shell stable at $name width", async ({ height, width }) => {
    setViewportSize(width, height);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", {
        name: "Desktop primary navigation",
      }),
    ).toHaveClass("hidden", "lg:block");
    expect(
      screen.getByRole("navigation", { name: "Mobile primary navigation" }),
    ).toHaveClass("overflow-x-auto", "lg:hidden");
    expect(screen.getByRole("main")).toHaveClass("lg:pl-72");
  });
});

function setViewportSize(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
  window.dispatchEvent(new Event("resize"));
}
