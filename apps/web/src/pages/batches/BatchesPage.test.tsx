import { fireEvent, render, screen } from "@testing-library/react";
import type { BatchListItem, BatchPlaneClient } from "@batchplane/ui-client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../../i18n/i18n";
import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import { BatchesPage } from "./BatchesPage";

const activeBatch: BatchListItem = {
  batchId: "payment.daily-close",
  criticality: "HIGH",
  environment: "PROD",
  gateRequired: true,
  hasExecutableCommand: true,
  name: "Daily Close",
  owner: "ops-team",
  status: "ACTIVE",
};

describe("BatchesPage", () => {
  let client: BatchPlaneClient;

  beforeEach(() => {
    client = createClient({ batches: [activeBatch] });
  });

  it("renders the no-session state with a setup link", async () => {
    client = {
      listBatches: async () => ({ type: "workspace-not-connected" }),
    } as unknown as BatchPlaneClient;

    renderPage(client);

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
    client = {
      listBatches: () => new Promise(() => undefined),
    } as unknown as BatchPlaneClient;

    renderPage(client);

    expect(
      screen.getByText("Loading batch definitions..."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
  });

  it("renders the empty state for an installed Workspace with no batches", async () => {
    client = createClient({ batches: [] });

    renderPage(client);

    expect(
      await screen.findByText(
        "No batch definitions are registered on main yet.",
      ),
    ).toBeInTheDocument();
  });

  it("renders an error state when batch loading fails", async () => {
    client = {
      listBatches: async () => {
        throw new Error("Batch list unavailable");
      },
    } as unknown as BatchPlaneClient;

    renderPage(client);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Batch list unavailable",
    );
  });

  it("renders executable and blocked batch rows with clear actions", async () => {
    client = createClient({
      batches: [
        activeBatch,
        {
          ...activeBatch,
          batchId: "payment.paused",
          name: "Paused Payment",
          status: "INACTIVE",
        },
      ],
    });

    renderPage(client);

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

  it("keeps loaded columns reachable through a horizontal scroll container", async () => {
    renderPage(client);

    const table = await screen.findByRole("table");

    expect(table.parentElement).toHaveClass("max-w-full", "overflow-x-auto");
  });

  it("reloads the batch list when Refresh is selected", async () => {
    const listBatches = vi
      .fn()
      .mockResolvedValueOnce({
        batches: [activeBatch],
        sourceRevision: "main",
        type: "loaded",
      })
      .mockResolvedValueOnce({
        batches: [{ ...activeBatch, name: "Refreshed Daily Close" }],
        sourceRevision: "main",
        type: "loaded",
      });
    client = { listBatches } as unknown as BatchPlaneClient;

    renderPage(client);

    expect(await screen.findByText("Daily Close")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(
      await screen.findByText("Refreshed Daily Close"),
    ).toBeInTheDocument();
    expect(listBatches).toHaveBeenCalledTimes(2);
  });
});

function renderPage(client: BatchPlaneClient) {
  render(
    <BatchPlaneClientContext.Provider value={client}>
      <MemoryRouter>
        <BatchesPage />
      </MemoryRouter>
    </BatchPlaneClientContext.Provider>,
  );
}

function createClient({
  batches = [activeBatch],
}: {
  batches?: BatchListItem[];
} = {}): BatchPlaneClient {
  return {
    listBatches: async () => ({
      batches,
      sourceRevision: "main",
      type: "loaded",
    }),
  } as BatchPlaneClient;
}
