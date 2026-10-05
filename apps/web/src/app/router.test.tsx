import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, matchRoutes } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WorkspaceNotConnectedError,
  type BatchChangeDraft,
  type BatchPlaneClient,
} from "@batchplane/ui-client";
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
  listExecutionRuns: async () => {
    throw new WorkspaceNotConnectedError();
  },
  inspectWorkspace: async () => {
    throw new WorkspaceNotConnectedError();
  },
  requestWorkspaceInstallation: async () => {
    throw new WorkspaceNotConnectedError();
  },
  requestWorkspaceUpdate: async () => {
    throw new WorkspaceNotConnectedError();
  },
  requestWorkspacePolicyChange: async () => {
    throw new WorkspaceNotConnectedError();
  },
  getExecutionRun: async () => {
    throw new WorkspaceNotConnectedError();
  },
  getExecutionRunJobLog: async () => {
    throw new WorkspaceNotConnectedError();
  },
  createFailureFollowUp: async () => {
    throw new WorkspaceNotConnectedError();
  },
  reviewFailureFollowUp: async () => {
    throw new WorkspaceNotConnectedError();
  },
  listAuditTimeline: async () => {
    throw new WorkspaceNotConnectedError();
  },
  getDashboardSummary: async () => {
    throw new WorkspaceNotConnectedError();
  },
  approveChangeRequest: async () => {
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
  getChangeRequest: async () => null,
  listBatches: async () => ({ type: "workspace-not-connected" as const }),
  loadBatchChangeDraft: async (): Promise<BatchChangeDraft> => ({
    batch: {
      batchId: "",
      criticality: "MEDIUM",
      domain: "",
      environment: "PROD",
      name: "",
      owner: "",
      status: "ACTIVE",
    },
    execution: {
      command: "",
      platform: "GITHUB_ACTIONS",
      ref: "main",
      runnerLabel: "ubuntu-latest",
    },
    changeRequestId: "test-change",
    mode: "create",
    schedules: [],
  }),
  getBatchChangeBlocker: async () => null,
  previewBatchChange: async () => ({
    files: [],
    hasEffectiveChanges: false,
    targetRevisionDigest: "sha256:test",
  }),
  loadExecutionRequestDraft: async () => {
    throw new WorkspaceNotConnectedError();
  },
  previewExecutionRequest: async () => {
    throw new WorkspaceNotConnectedError();
  },
  createExecutionRequest: async () => {
    throw new WorkspaceNotConnectedError();
  },
  getExecutionRequest: async () => {
    throw new WorkspaceNotConnectedError();
  },
  approveExecutionRequest: async () => {
    throw new WorkspaceNotConnectedError();
  },
  rejectExecutionRequest: async () => {
    throw new WorkspaceNotConnectedError();
  },
  listApprovalRequests: async () => {
    throw new WorkspaceNotConnectedError();
  },
  listWorkspaceRequests: async () => {
    throw new WorkspaceNotConnectedError();
  },
  getMyWork: async () => {
    throw new WorkspaceNotConnectedError();
  },
  requestBatchRemediation: async () => {
    throw new Error("Workspace is not connected.");
  },
  rejectChangeRequest: async () => {
    throw new Error("Workspace is not connected.");
  },
  withdrawChangeRequest: async () => {
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
    { id: "execution-detail", path: "/executions/204?runAttempt=2#logs" },
    { id: "executions", path: "/executions" },
    { id: "failures", path: "/executions/failures?type=blocked" },
    { id: "requests", path: "/requests" },
    { id: "approvals", path: "/approvals" },
    {
      id: "change-request-detail",
      path: "/approvals/registration/42",
    },
    { id: "audit", path: "/audit" },
    { id: "workspace", path: "/workspace" },
    { id: "not-found", path: "/unknown" },
  ])("maps $path to the $id route", ({ id, path }) => {
    expect(matchRoutes(appRoutes, path)?.at(-1)?.route.id).toBe(id);
  });

  it("redirects the index route to the dashboard", async () => {
    const router = renderRouter("/");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/dashboard");
    });
    expect(router.state.matches.at(-1)?.route.id).toBe("dashboard");
  });

  it.each([undefined, "/batchplane/"])(
    "redirects legacy schedule links with their exact encoded query and hash under %s",
    async (basename) => {
      const router = renderRouter(
        `${basename ?? "/"}batches/payment%2Fdaily%20close/schedules/new`,
        basename,
      );

      await waitFor(() => {
        expect(router.state.location).toMatchObject({
          hash: "#schedules",
          pathname: `${basename ?? "/"}batches/new`,
          search: "?change=payment%2Fdaily%20close",
        });
      });
      expect(router.state.matches.at(-1)?.route.id).toBe("batch-registration");
    },
  );

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

  it("keeps query and hash through internal navigation and back under the Pages basename", async () => {
    const entry = "/batchplane/executions/204?runAttempt=2&from=failures#logs";
    const router = renderRouter(entry, "/batchplane/");

    fireEvent.click(
      await screen.findByRole("link", { name: "Open Workspace" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Workspace" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/batchplane/workspace");

    await act(async () => {
      await router.navigate(-1);
    });
    expect(
      await screen.findByRole("link", { name: "Open Workspace" }),
    ).toBeInTheDocument();
    expect(router.state.location).toMatchObject({
      pathname: "/batchplane/executions/204",
      search: "?runAttempt=2&from=failures",
      hash: "#logs",
    });
    expect(router.state.matches.at(-1)?.params.executionId).toBe("204");
  });

  it("renders unknown paths and permits navigation out of the wildcard route", async () => {
    const router = renderRouter(
      "/batchplane/unknown/nested?keep=1#missing",
      "/batchplane/",
    );

    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("link", { name: "Dashboard" })[0]!);
    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/batchplane/dashboard");
  });

  it("preserves page query errors and navigation back to the failed detail", async () => {
    const getExecutionRun = vi
      .fn()
      .mockRejectedValue(new Error("Execution lookup failed"));
    const router = renderRouter(
      "/executions/204?runAttempt=2#logs",
      undefined,
      {
        ...disconnectedClient,
        getExecutionRun,
      },
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Execution lookup failed",
    );
    fireEvent.click(screen.getAllByRole("link", { name: "Dashboard" })[0]!);
    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    await act(async () => {
      await router.navigate(-1);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Execution lookup failed",
    );
    expect(getExecutionRun).toHaveBeenLastCalledWith({
      runId: "204",
      runAttempt: 2,
    });
    expect(router.state.location).toMatchObject({
      pathname: "/executions/204",
      search: "?runAttempt=2",
      hash: "#logs",
    });
  });

  it("keeps execution details under Executions and activates only Failures there", async () => {
    const detailRouter = renderRouter("/executions/204");

    await waitFor(() => {
      expect(detailRouter.state.matches.at(-1)?.route.id).toBe(
        "execution-detail",
      );
    });
    expect(
      screen
        .getAllByRole("link", { name: "Executions" })
        .every((link) => link.className.includes("bg-bp-control")),
    ).toBe(true);

    cleanup();
    const failureRouter = renderRouter("/executions/failures");

    await waitFor(() => {
      expect(failureRouter.state.matches.at(-1)?.route.id).toBe("failures");
    });
    expect(
      screen
        .getAllByRole("link", { name: "Executions" })
        .every((link) => !link.className.includes("bg-bp-control")),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link", { name: "Failures" })
        .every((link) => link.className.includes("bg-bp-control")),
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

function renderRouter(
  initialEntry: string,
  basename?: string,
  client: BatchPlaneClient = disconnectedClient,
) {
  const router = createMemoryRouter(appRoutes, {
    basename,
    initialEntries: [initialEntry],
  });

  render(
    <BatchPlaneClientContext.Provider value={client}>
      <RouterProvider router={router} />
    </BatchPlaneClientContext.Provider>,
  );

  return router;
}
