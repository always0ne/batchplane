import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  WorkspaceNotConnectedError,
  type CreateGovernedChangeResult,
  type BatchDetailResult,
  type BatchPlaneClient,
} from "@batchplane/ui-client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import "../../i18n/i18n";
import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import { BatchDetailPage } from "./BatchDetailPage";

const activeDetail: BatchDetailResult = {
  batch: {
    batchId: "payment.daily-close",
    criticality: "HIGH",
    domain: "payments",
    environment: "PROD",
    execution: {
      artifactPath: "dist/daily-close.jar",
      command: "java -jar dist/daily-close.jar",
      runsOn: ["self-hosted", "payments"],
    },
    gateRequired: true,
    labels: ["close"],
    name: "Daily Close",
    owner: "ops-team",
    schedules: [
      {
        cron: "0 2 * * *",
        enabled: true,
        generatedCron: "0 17 * * *",
        name: "Daily close",
        scheduleId: "daily-close",
        timezone: "Asia/Seoul",
      },
    ],
    status: "ACTIVE",
    workflow: { path: ".github/workflows/daily-close.yml", ref: "main" },
  },
  control: {
    approvedRevision: {
      governedChangeId: "bgc-approved-daily-close",
      targetRevisionDigest: "sha256:approved",
      verifiedSha: "abc123",
    },
    remediation: { availableKinds: [], canRequest: false },
    status: "VERIFIED",
  },
  defaultBranch: "main",
  recentExecutionRequests: [
    {
      locator: "81",
      requestDigest: "sha256:request-81",
      requestId: "btr-daily-close-81",
      requestedAt: "2026-09-10T01:02:03.000Z",
      requester: "jane",
      status: "DISPATCHED",
      title: "Run payment.daily-close",
    },
  ],
  type: "active",
};

describe("BatchDetailPage", () => {
  it("renders execution target, schedules, verified control, and internal recent-request links", async () => {
    renderDetail(createClient(activeDetail));

    expect(await screen.findByText("Daily Close")).toBeInTheDocument();
    expect(screen.getByText("Revision verified")).toBeInTheDocument();
    expect(screen.getByText("Dispatched")).toBeInTheDocument();
    expect(screen.getByText("self-hosted, payments")).toBeInTheDocument();
    expect(screen.getByText("dist/daily-close.jar")).toBeInTheDocument();
    expect(
      screen.getByText("java -jar dist/daily-close.jar"),
    ).toBeInTheDocument();
    expect(screen.getByText("Daily close")).toBeInTheDocument();
    expect(screen.getByText("0 17 * * *")).toBeInTheDocument();
    expect(screen.getByText("jane")).toBeInTheDocument();
    expect(screen.getByText("btr-daily-close-81")).toBeInTheDocument();
    expect(screen.getByText("sha256:request-81")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Run payment.daily-close" }),
    ).toHaveAttribute("href", "/execution-requests/81");
    expect(screen.getByText("Daily close")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request run" })).toHaveAttribute(
      "href",
      "/batches/payment.daily-close/execution-requests/new",
    );
  });

  it("blocks bypassed manual execution and navigates only after an explicit remediation request", async () => {
    const requestBatchRemediation = vi.fn(async () =>
      governedChangeResult("121"),
    );
    renderDetail(
      createClient(
        {
          ...activeDetail,
          control: {
            disabledReason: "UNAPPROVED_BATCH_REVISION",
            remediation: {
              availableKinds: ["REVIEW_CURRENT"],
              canRequest: true,
            },
            status: "BYPASSED",
          },
        },
        { requestBatchRemediation },
      ),
    );

    const runButton = await screen.findByRole("button", {
      name: "Request run",
    });
    expect(runButton).toBeDisabled();
    expect(runButton).toHaveAttribute(
      "title",
      expect.stringContaining("not been approved"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review current revision" }),
    );

    await waitFor(() => {
      expect(requestBatchRemediation).toHaveBeenCalledWith({
        batchId: "payment.daily-close",
        kind: "REVIEW_CURRENT",
      });
    });
    expect(await screen.findByText("Governed change 121")).toBeInTheDocument();
  });

  it("blocks unknown manual execution without exposing a remediation action the adapter did not authorize", async () => {
    renderDetail(
      createClient({
        ...activeDetail,
        control: {
          disabledReason: "APPROVED_BATCH_REVISION_UNAVAILABLE",
          remediation: { availableKinds: [], canRequest: false },
          status: "UNKNOWN",
        },
      }),
    );

    const runButton = await screen.findByRole("button", {
      name: "Request run",
    });
    expect(runButton).toBeDisabled();
    expect(runButton).toHaveAttribute(
      "title",
      expect.stringContaining("Refresh the page"),
    );
    expect(runButton).not.toHaveAttribute(
      "title",
      expect.stringContaining("remediation"),
    );
    expect(
      screen.queryByRole("button", { name: "Review current revision" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a deleted archive and its recent request evidence on the detail route", async () => {
    renderDetail(
      createClient({
        defaultBranch: "main",
        recentExecutionRequests: activeDetail.recentExecutionRequests,
        type: "deleted",
        archive: {
          batch: activeDetail.batch,
          sourceRequest: {
            locator: "44",
            number: 44,
            url: "https://example.test/44",
          },
          status: "VERIFIED",
        },
      }),
    );

    expect(await screen.findByText("Deleted")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Source request #44" }),
    ).toHaveAttribute("href", "/approvals/registration/44");
    expect(
      screen.getByRole("link", { name: "Run payment.daily-close" }),
    ).toHaveAttribute("href", "/execution-requests/81");
  });

  it.each([
    [
      "disconnected",
      () => Promise.reject(new WorkspaceNotConnectedError()),
      "Connect a Workspace before viewing governed batches.",
    ],
    [
      "not found",
      () =>
        Promise.resolve({
          batchId: "payment.daily-close",
          type: "not-found" as const,
        }),
      "Batch payment.daily-close was not found.",
    ],
    [
      "error",
      () => Promise.reject(new Error("Batch detail unavailable")),
      "Batch detail unavailable",
    ],
  ])("renders the %s state", async (_name, getBatchDetail, expectedMessage) => {
    renderDetail(createClient(activeDetail, { getBatchDetail }));
    expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
  });

  it("keeps a loading state visible while the detail query is pending", () => {
    renderDetail(
      createClient(activeDetail, {
        getBatchDetail: () => new Promise(() => undefined),
      }),
    );
    expect(screen.getByText("Loading batch detail...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
  });

  it("reloads the detail when Refresh is selected", async () => {
    const getBatchDetail = vi
      .fn()
      .mockResolvedValueOnce(activeDetail)
      .mockResolvedValueOnce({
        ...activeDetail,
        batch: { ...activeDetail.batch, name: "Refreshed Daily Close" },
      });
    renderDetail(createClient(activeDetail, { getBatchDetail }));

    expect(await screen.findByText("Daily Close")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(
      await screen.findByText("Refreshed Daily Close"),
    ).toBeInTheDocument();
    expect(getBatchDetail).toHaveBeenCalledTimes(2);
  });

  it("rechecks the pending-change blocker when Refresh reloads the detail", async () => {
    const getBatchChangeBlocker = vi.fn().mockResolvedValue(null);
    renderDetail(createClient(activeDetail, { getBatchChangeBlocker }));

    await screen.findByRole("link", { name: "Request change" });
    await waitFor(() => {
      expect(getBatchChangeBlocker).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => {
      expect(getBatchChangeBlocker).toHaveBeenCalledTimes(2);
    });
  });

  it("routes a normal governed change from the detail actions", async () => {
    renderDetail(createClient(activeDetail));
    expect(
      await screen.findByRole("link", { name: "Request change" }),
    ).toHaveAttribute("href", "/batches/new?change=payment.daily-close");
  });

  it("requires the exact batch ID before routing a delete request", async () => {
    renderDetail(createClient(activeDetail));
    fireEvent.click(
      await screen.findByRole("button", { name: "Request delete" }),
    );
    const confirmation = screen.getByLabelText("Type Batch ID to confirm");
    expect(
      screen.getByRole("button", { name: "Create delete request" }),
    ).toBeDisabled();
    fireEvent.change(confirmation, {
      target: { value: "payment.daily-close" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create delete request" }),
    );
    expect(
      await screen.findByText("/batches/new?delete=payment.daily-close"),
    ).toBeInTheDocument();
  });

  it("blocks normal change and delete actions behind a pending internal request link", async () => {
    renderDetail(
      createClient(activeDetail, {
        getBatchChangeBlocker: async () => ({
          kind: "GOVERNED_CHANGE",
          requestLocator: "77",
          title: "Pending payment change",
        }),
      }),
    );
    expect(
      await screen.findByText("Pending payment change"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open change request" }),
    ).toHaveAttribute("href", "/approvals/registration/77");
    expect(
      screen.getByRole("button", { name: "Request change" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Request delete" }),
    ).toBeDisabled();
  });
});

function createClient(
  detail: BatchDetailResult,
  overrides: Partial<BatchPlaneClient> = {},
): BatchPlaneClient {
  return {
    approveGovernedChange: unsupported,
    createBatchChangeRequest: unsupported,
    getBatchChangeBlocker: async () => null,
    getBatchDetail: async () => detail,
    getBatchRemediationCapability: async () => ({
      availableKinds: [],
      canRequest: false,
    }),
    getGovernedChange: async () => null,
    listBatches: unsupported,
    loadBatchChangeDraft: unsupported,
    previewBatchChange: unsupported,
    rejectGovernedChange: unsupported,
    requestBatchRemediation: async () => governedChangeResult("1"),
    withdrawGovernedChange: unsupported,
    ...overrides,
  } satisfies BatchPlaneClient;
}

function renderDetail(client: BatchPlaneClient) {
  render(
    <BatchPlaneClientContext.Provider value={client}>
      <MemoryRouter initialEntries={["/batches/payment.daily-close"]}>
        <Routes>
          <Route path="/batches/:batchId" element={<BatchDetailPage />} />
          <Route
            path="/approvals/registration/:requestLocator"
            element={<p>Governed change 121</p>}
          />
          <Route path="/batches/new" element={<Location />} />
        </Routes>
      </MemoryRouter>
    </BatchPlaneClientContext.Provider>,
  );
}

async function unsupported(): Promise<never> {
  throw new Error("This client method is not used by the Batch detail test.");
}

function governedChangeResult(
  requestLocator: string,
): CreateGovernedChangeResult {
  return {
    request: {
      batchId: "payment.daily-close",
      evidence: { kind: "LEGACY_UNAPPROVABLE" },
      mode: "CHANGE",
      requestLocator,
      requester: "test-user",
      reviewState: "OPEN",
      sourceLabel: "BatchPlane",
      title: "Governed change",
    },
  };
}

function Location() {
  const { pathname, search } = useLocation();
  return <p>{`${pathname}${search}`}</p>;
}
