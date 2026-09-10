import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BatchChangeDraft, BatchPlaneClient } from "@batchplane/ui-client";
import { BatchPlaneClientContext } from "../client/batch-plane-client-context";
import "../i18n/i18n";
import { i18next } from "../i18n/i18n";
import { localeStorageKey } from "../i18n/locale-detector";
import { appRoutes } from "./router";

const NodeRequest = globalThis.Request;

class RouterTestRequest extends NodeRequest {
  constructor(input: string | URL, init: RequestInit = {}) {
    const requestInit = { ...init };
    delete requestInit.signal;

    super(input, requestInit);
  }
}

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

describe("app router", () => {
  beforeEach(async () => {
    sessionStorage.clear();
    localStorage.clear();
    await i18next.changeLanguage("en");
    vi.unstubAllEnvs();
    // jsdom's AbortSignal is not accepted by Node 24's undici Request.
    vi.stubGlobal("Request", RouterTestRequest);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    { id: "dashboard", path: "/dashboard" },
    { id: "my-work", path: "/my-work" },
    { id: "batches", path: "/batches" },
    { id: "batch-registration", path: "/batches/new" },
    { id: "batch-detail", path: "/batches/payment.daily-close" },
    {
      id: "execution-request-create",
      path: "/batches/payment.daily-close/execution-requests/new",
    },
    { id: "execution-request-detail", path: "/execution-requests/42" },
    { id: "execution-run-detail", path: "/execution-runs/204" },
    { id: "runs", path: "/runs" },
    { id: "failures", path: "/failures" },
    { id: "requests", path: "/requests" },
    { id: "approvals", path: "/approvals" },
    {
      id: "governed-change-detail",
      path: "/approvals/registration/42",
    },
    { id: "audit", path: "/audit" },
    { id: "lite-setup", path: "/lite/setup" },
    { id: "not-found", path: "/unknown" },
  ])(
    "renders the $id route from the shared memory route tree",
    async ({ id, path }) => {
      const router = renderRouter(path);

      expect(await screen.findByTestId("app-logo")).toBeInTheDocument();
      await waitFor(() => {
        expect(router.state.matches.at(-1)?.route.id).toBe(id);
      });
    },
  );

  it("redirects the index route to the dashboard", async () => {
    const router = renderRouter("/");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/dashboard");
    });
    expect(router.state.matches.at(-1)?.route.id).toBe("dashboard");
  });

  it("redirects legacy schedule links with their exact encoded query and hash", async () => {
    const router = renderRouter(
      "/batches/payment%2Fdaily%20close/schedules/new",
    );

    await waitFor(() => {
      expect(router.state.location).toMatchObject({
        hash: "#schedules",
        pathname: "/batches/new",
        search: "?change=payment%2Fdaily%20close",
      });
    });
    expect(router.state.matches.at(-1)?.route.id).toBe("batch-registration");
  });

  it("honors the GitHub Pages basename in its memory router links", async () => {
    const router = renderRouter("/batchplane", "/batchplane");

    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/batchplane/dashboard");
    expect(router.state.matches.at(-1)?.route.id).toBe("dashboard");
    expect(
      screen
        .getAllByRole("link", { name: "Dashboard" })
        .every((link) => link.getAttribute("href") === "/batchplane/dashboard"),
    ).toBe(true);
  });

  it("persists locale changes without resetting page form state", async () => {
    renderRouter("/batches/new");

    const batchId = await screen.findByLabelText("Batch ID");
    fireEvent.change(batchId, { target: { value: "payment.daily-close" } });
    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "ko" },
    });

    expect(localStorage.getItem(localeStorageKey)).toBe("ko");
    expect(
      await screen.findByRole("heading", { name: "등록" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Batch ID")).toBe(batchId);
    expect(batchId).toHaveValue("payment.daily-close");
  });

  it("remounts the outlet body, but not the header, when the fixture changes", async () => {
    renderRouter("/batches/new");

    const batchId = await screen.findByLabelText("Batch ID");
    const fixtureSelector = screen.getByLabelText("Fixture");
    const appMain = screen.getByRole("main");
    fireEvent.change(batchId, { target: { value: "payment.daily-close" } });

    fireEvent.change(fixtureSelector, { target: { value: "happy-path" } });

    await waitFor(() => {
      expect(screen.getByLabelText("Batch ID")).not.toBe(batchId);
    });
    expect(screen.getByLabelText("Fixture")).toBe(fixtureSelector);
    expect(screen.getByRole("main")).toBe(appMain);
  });

  it("hides the development fixture selector in production", async () => {
    vi.stubEnv("DEV", false);
    renderRouter("/dashboard");

    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Fixture")).not.toBeInTheDocument();
  });
});

function renderRouter(initialEntry: string, basename?: string) {
  const router = createMemoryRouter(appRoutes, {
    basename,
    initialEntries: [initialEntry],
  });

  render(
    <BatchPlaneClientContext.Provider value={disconnectedClient}>
      <RouterProvider router={router} />
    </BatchPlaneClientContext.Provider>,
  );

  return router;
}
