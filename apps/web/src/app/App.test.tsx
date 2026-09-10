import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { BatchChangeDraft, BatchPlaneClient } from "@batchplane/ui-client";
import { BatchPlaneClientContext } from "../client/batch-plane-client-context";
import "../i18n/i18n";
import { i18next } from "../i18n/i18n";
import { localeStorageKey } from "../i18n/locale-detector";
import type { RuntimeFixtureId } from "../runtime/runtime-fixtures";
import { AppShell } from "./AppShell";

const disconnectedClient = {
  approveGovernedChange: async () => {
    throw new Error("Workspace is not connected.");
  },
  createBatchChangeRequest: async () => {
    throw new Error("Workspace is not connected.");
  },
  getBatchDetail: async ({ batchId }) => ({
    batchId,
    type: "not-found" as const,
  }),
  getBatchRemediationCapability: async () => ({
    availableKinds: [],
    canRequest: false,
  }),
  getGovernedChange: async () => null,
  listBatches: async () => ({ type: "workspace-not-connected" as const }),
  loadBatchChangeDraft: async (): Promise<BatchChangeDraft> => ({
    batch: {
      batchId: "",
      criticality: "MEDIUM",
      domain: "",
      environment: "PROD",
      name: "",
      owner: "",
      runCommand: "",
      runnerLabel: "ubuntu-latest",
      status: "ACTIVE",
      workflowRef: "main",
    },
    governedChangeId: "test-change",
    mode: "create",
    schedules: [],
  }),
  getBatchChangeBlocker: async () => null,
  previewBatchChange: async () => ({
    files: [],
    hasEffectiveChanges: false,
    targetRevisionDigest: "sha256:test",
  }),
  requestBatchRemediation: async () => {
    throw new Error("Workspace is not connected.");
  },
  rejectGovernedChange: async () => {
    throw new Error("Workspace is not connected.");
  },
  withdrawGovernedChange: async () => {
    throw new Error("Workspace is not connected.");
  },
} satisfies BatchPlaneClient;

describe("App", () => {
  beforeEach(async () => {
    sessionStorage.clear();
    localStorage.clear();
    await i18next.changeLanguage("en");
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    { heading: "Dashboard", path: "/dashboard" },
    { heading: "My Work", path: "/my-work" },
    { heading: "Workspace", path: "/lite/setup" },
    { heading: "Batches", path: "/batches" },
    { heading: "Registration", path: "/batches/new" },
    { heading: "Executions", path: "/runs" },
    { heading: "Failures", path: "/failures" },
    { heading: "Workspace requests", path: "/requests" },
    { heading: "Approvals", path: "/approvals" },
    { heading: "Audit Trail", path: "/audit" },
  ])("renders the $path route", async ({ heading, path }) => {
    renderApp(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: heading }),
    ).toBeInTheDocument();
    expect(screen.getByText("BatchPlane")).toBeInTheDocument();
  });

  it("redirects the root route to the exact dashboard path", async () => {
    renderApp(
      <MemoryRouter initialEntries={["/"]}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
  });

  it("redirects legacy schedule deep links with the exact encoded change target", async () => {
    renderApp(
      <MemoryRouter
        initialEntries={["/batches/payment%2Fdaily%20close/schedules/new"]}
      >
        <App />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Change request" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/batches/new?change=payment%2Fdaily%20close#schedules",
    );
  });

  it("renders the execution run detail route with the development fixture", async () => {
    sessionStorage.setItem("batchplane.dev.runtimeFixture", "happy-path");

    renderApp(
      <MemoryRouter initialEntries={["/execution-runs/204"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Execution run detail" }),
    ).toBeInTheDocument();
  });

  it("renders a not found state for unknown routes", async () => {
    renderApp(
      <MemoryRouter initialEntries={["/unknown"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });

  it("renders the development runtime fixture switcher", async () => {
    renderApp(
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

  it("hides the development runtime fixture switcher in production", async () => {
    vi.stubEnv("DEV", false);

    renderApp(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Fixture")).not.toBeInTheDocument();
  });

  it("persists the selected locale and updates the rendered labels", async () => {
    renderApp(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Dashboard" });
    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "ko" },
    });

    expect(localStorage.getItem(localeStorageKey)).toBe("ko");
    expect(
      await screen.findByRole("heading", { name: "대시보드" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("언어")).toHaveValue("ko");
  });

  it("remounts only the route content when the fixture changes", () => {
    renderApp(
      <MemoryRouter>
        <FixtureRemountHarness />
      </MemoryRouter>,
    );

    const fixtureSelector = screen.getByLabelText("Fixture");
    const initialPageInstance = screen.getByTestId("page-instance").textContent;

    fireEvent.change(fixtureSelector, { target: { value: "live" } });
    expect(screen.getByTestId("page-instance")).toHaveTextContent(
      initialPageInstance ?? "",
    );
    expect(screen.getByLabelText("Fixture")).toBe(fixtureSelector);

    fireEvent.change(fixtureSelector, { target: { value: "happy-path" } });
    expect(screen.getByTestId("page-instance")).not.toHaveTextContent(
      initialPageInstance ?? "",
    );
    expect(screen.getByLabelText("Fixture")).toBe(fixtureSelector);
  });

  it("groups navigation by product area and keeps the active request route visible", async () => {
    renderApp(
      <MemoryRouter initialEntries={["/requests"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Workspace requests" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: "Overview" }).length).toBe(2);
    expect(screen.getAllByRole("group", { name: "Operations" }).length).toBe(2);
    expect(screen.getAllByRole("group", { name: "Governance" }).length).toBe(2);
    expect(screen.getAllByRole("group", { name: "Workspace" }).length).toBe(2);
    expect(
      screen
        .getAllByRole("link", { name: "Requests" })
        .some((link) => link.className.includes("bg-bp-control")),
    ).toBe(true);
  });

  it.each([
    { height: 800, name: "mobile", width: 375 },
    { height: 900, name: "desktop", width: 1280 },
  ])("keeps the app shell stable at $name width", async ({ height, width }) => {
    setViewportSize(width, height);

    renderApp(
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

function renderApp(content: ReactNode) {
  render(
    <BatchPlaneClientContext.Provider value={disconnectedClient}>
      {content}
    </BatchPlaneClientContext.Provider>,
  );
}

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

function LocationProbe() {
  const location = useLocation();

  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}

function FixtureRemountHarness() {
  const [runtimeFixture, setRuntimeFixture] =
    useState<RuntimeFixtureId>("live");

  return (
    <AppShell
      runtimeFixture={runtimeFixture}
      onRuntimeFixtureChange={setRuntimeFixture}
    >
      <FixturePageInstance />
    </AppShell>
  );
}

let nextPageInstance = 0;

function FixturePageInstance() {
  const [instance] = useState(() => ++nextPageInstance);

  return <output data-testid="page-instance">{instance}</output>;
}
