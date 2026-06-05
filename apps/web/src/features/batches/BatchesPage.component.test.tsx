import { render, screen } from "@testing-library/react";
import type {
  BatchDefinition,
  BatchPlaneRuntimePorts,
} from "@batchplane/domain";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../../i18n/i18n";
import { BatchesPage } from "./BatchesPage";

const runtimeMocks = vi.hoisted(() => ({
  createBatchPlaneRuntime: vi.fn(),
  readRuntimeSession: vi.fn(),
}));

vi.mock("../../runtime/runtime-fixtures", () => ({
  createBatchPlaneRuntime: runtimeMocks.createBatchPlaneRuntime,
  readRuntimeSession: runtimeMocks.readRuntimeSession,
}));

const session = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

const activeBatch: BatchDefinition = {
  batchId: "payment.daily-close",
  criticality: "HIGH",
  domain: "payments",
  environment: "PROD",
  execution: {
    command: "echo close payments",
    runsOn: "ubuntu-latest",
  },
  gateRequired: true,
  name: "Daily Close",
  owner: "ops-team",
  status: "ACTIVE",
  workflow: {
    path: ".github/workflows/payment.daily-close.yml",
    ref: "main",
  },
};

describe("BatchesPage", () => {
  beforeEach(() => {
    runtimeMocks.createBatchPlaneRuntime.mockReset();
    runtimeMocks.readRuntimeSession.mockReset();
    runtimeMocks.readRuntimeSession.mockReturnValue(session);
    runtimeMocks.createBatchPlaneRuntime.mockReturnValue(
      createRuntime({ batches: [activeBatch] }),
    );
  });

  it("renders the no-session state with a setup link", async () => {
    runtimeMocks.readRuntimeSession.mockReturnValue(null);

    renderPage();

    expect(
      await screen.findByText(
        "Connect a Workspace before viewing governed batches.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Workspace" }),
    ).toHaveAttribute("href", "/lite/setup");
  });

  it("renders the loading state while batch definitions are being fetched", () => {
    runtimeMocks.createBatchPlaneRuntime.mockReturnValue(
      createRuntime({
        getRepository: () => new Promise(() => undefined),
      }),
    );

    renderPage();

    expect(
      screen.getByText("Loading batch definitions..."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
  });

  it("renders the empty state for an installed Workspace with no batches", async () => {
    runtimeMocks.createBatchPlaneRuntime.mockReturnValue(
      createRuntime({ batches: [] }),
    );

    renderPage();

    expect(
      await screen.findByText(
        "No batch definitions are registered on main yet.",
      ),
    ).toBeInTheDocument();
  });

  it("renders an error state when batch loading fails", async () => {
    runtimeMocks.createBatchPlaneRuntime.mockReturnValue(
      createRuntime({
        listBatchDefinitions: async () => {
          throw new Error("Batch list unavailable");
        },
      }),
    );

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Batch list unavailable",
    );
  });

  it("renders executable and blocked batch rows with clear actions", async () => {
    runtimeMocks.createBatchPlaneRuntime.mockReturnValue(
      createRuntime({
        batches: [
          activeBatch,
          {
            ...activeBatch,
            batchId: "payment.paused",
            name: "Paused Payment",
            status: "INACTIVE",
          },
        ],
      }),
    );

    renderPage();

    expect(
      await screen.findByRole("link", { name: "payment.daily-close" }),
    ).toHaveAttribute("href", "/batches/payment.daily-close");
    expect(screen.getByText("Daily Close")).toBeInTheDocument();
    expect(screen.getAllByText("Required")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "Register batch" }),
    ).toHaveAttribute("href", "/batches/new");
    expect(screen.getByRole("link", { name: "Request run" })).toHaveAttribute(
      "href",
      "/batches/payment.daily-close/execution-requests/new",
    );

    expect(await screen.findByText("Paused Payment")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toHaveAttribute(
      "title",
      "Inactive batches cannot be requested for execution.",
    );
    expect(screen.getByRole("button", { name: "Request run" })).toBeDisabled();
  });
});

function renderPage() {
  render(
    <MemoryRouter>
      <BatchesPage />
    </MemoryRouter>,
  );
}

function createRuntime({
  batches = [activeBatch],
  getRepository = async () => ({
    defaultBranch: "main",
    owner: "always0ne",
    private: true,
    repo: "batch",
    url: "https://github.com/always0ne/batch",
  }),
  listBatchDefinitions = async () => batches,
}: {
  batches?: BatchDefinition[];
  getRepository?: () => Promise<{
    defaultBranch: string;
    owner: string;
    private: boolean;
    repo: string;
    url: string;
  }>;
  listBatchDefinitions?: () => Promise<BatchDefinition[]>;
} = {}): BatchPlaneRuntimePorts {
  return {
    batches: {
      listBatchDefinitions,
    },
    settings: {
      getRepository,
    },
  } as unknown as BatchPlaneRuntimePorts;
}
