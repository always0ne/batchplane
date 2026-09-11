import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type {
  BatchPlaneClient,
  ExecutionRequest,
  ExecutionRequestDraft,
} from "@batchplane/ui-client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import "../../i18n/i18n";
import { i18next } from "../../i18n/i18n";
import { ExecutionRequestPage } from "./ExecutionRequestPage";

const draft: ExecutionRequestDraft = {
  approvedBatchRevision: {
    governedChangeId: "bgc-payment-approved",
    targetRevisionDigest: "sha256:approved",
  },
  batch: {
    batchId: "payment.daily-close",
    criticality: "HIGH",
    domain: "payments",
    environment: "PROD",
    execution: { command: "echo mock batch", runsOn: "ubuntu-latest" },
    gateRequired: true,
    name: "Daily Close",
    owner: "ops-team",
    status: "ACTIVE",
    workflowPath: ".github/workflows/daily-close.yml",
    workflowRef: "main",
  },
  creationCapability: {
    canCreate: true,
    unavailableReasons: [],
  },
  requestId: "btr-payment-101",
  requestedAt: "2026-09-11T00:00:00.000Z",
  requestedBy: "jane",
  workspaceApprovalMode: "SELF_APPROVAL_BLOCKED",
  workspaceLabel: "Payments Workspace",
};

describe("ExecutionRequestPage", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("uses the loaded draft snapshot for preview and creation, then routes with the returned request", async () => {
    const previewExecutionRequest = vi.fn(async (input) => ({
      request: {
        ...createdRequest,
        evidence: {
          ...createdRequest.evidence,
          canonicalPayload: '{"parameters":["apiToken"]}',
        },
        requestId: input.draft.requestId,
      },
    }));
    const createExecutionRequest = vi.fn(async (input) => {
      expect(input.draft).toBe(draft);
      return { request: createdRequest };
    });
    renderPage(
      createClient({ createExecutionRequest, previewExecutionRequest }),
    );

    expect(await screen.findByText("Daily Close")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Close payments after reconciliation." },
    });
    await waitFor(() => expect(previewExecutionRequest).toHaveBeenCalled());
    fireEvent.click(
      screen.getByRole("button", { name: "Create execution request" }),
    );

    expect(
      await screen.findByText("Detail btr-payment-101"),
    ).toBeInTheDocument();
    expect(createExecutionRequest).toHaveBeenCalledTimes(1);
  });

  it("does not refetch the draft or erase form state when language changes", async () => {
    const loadExecutionRequestDraft = vi.fn(async () => ({
      draft,
      type: "ready" as const,
    }));
    renderPage(createClient({ loadExecutionRequestDraft }));

    const reason = await screen.findByLabelText("Reason");
    fireEvent.change(reason, { target: { value: "Keep this reason." } });
    await act(async () => {
      await i18next.changeLanguage("ko");
    });

    expect(await screen.findByLabelText("사유")).toHaveValue(
      "Keep this reason.",
    );
    expect(loadExecutionRequestDraft).toHaveBeenCalledTimes(1);
  });

  it("shows the prior batch fallback for the named not-found result", async () => {
    renderPage(
      createClient({
        loadExecutionRequestDraft: async () => ({
          batchId: "payment.daily-close",
          type: "not-found",
        }),
      }),
    );

    expect(
      await screen.findByText("Batch payment.daily-close was not found."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to batches" }),
    ).toHaveAttribute("href", "/batches");
  });

  it("renders adapter-projected creation readiness and prevents submission", async () => {
    const unavailableDraft: ExecutionRequestDraft = {
      ...draft,
      creationCapability: {
        canCreate: false,
        unavailableReasons: [
          "BATCH_INACTIVE",
          "EXECUTION_COMMAND_UNAVAILABLE",
          "GATE_NOT_REQUIRED",
        ],
      },
    };
    renderPage(
      createClient({
        loadExecutionRequestDraft: async () => ({
          draft: unavailableDraft,
          type: "ready",
        }),
      }),
    );

    expect(
      await screen.findByText(
        "Inactive batches cannot be requested for execution.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The batch command is not recorded in the batch definition.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "BatchPlane Gate is mandatory before execution can be requested.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create execution request" }),
    ).toBeDisabled();
  });

  it("renders a localized preview fallback for a non-Error rejection", async () => {
    renderPage(
      createClient({
        previewExecutionRequest: async () => Promise.reject("unavailable"),
      }),
    );

    expect(
      await screen.findByText("Failed to update request preview."),
    ).toBeInTheDocument();
  });
});

function renderPage(client: BatchPlaneClient) {
  render(
    <BatchPlaneClientContext.Provider value={client}>
      <MemoryRouter
        initialEntries={["/batches/payment.daily-close/execution-requests/new"]}
      >
        <Routes>
          <Route
            path="/batches/:batchId/execution-requests/new"
            element={<ExecutionRequestPage />}
          />
          <Route
            path="/execution-requests/:requestLocator"
            element={<DetailRoute />}
          />
        </Routes>
      </MemoryRouter>
    </BatchPlaneClientContext.Provider>,
  );
}

function createClient(
  overrides: Partial<BatchPlaneClient> = {},
): BatchPlaneClient {
  return {
    createExecutionRequest: async () => ({ request: createdRequest }),
    loadExecutionRequestDraft: async () => ({ draft, type: "ready" }),
    previewExecutionRequest: async () => ({ request: previewRequest }),
    ...overrides,
  } as unknown as BatchPlaneClient;
}

function DetailRoute() {
  return <p>Detail btr-payment-101</p>;
}

const createdRequest = {
  approvalDecision: undefined,
  attempts: { attempts: [], type: "loaded" },
  batch: {
    criticality: "HIGH",
    domain: "payments",
    environment: "PROD",
    name: "Daily Close",
    owner: "ops-team",
  },
  batchId: "payment.daily-close",
  capability: { canApprove: true, canReject: true },
  evidence: {
    approvedBatchRevision: draft.approvedBatchRevision,
    canonicalPayload: "{}",
    requestDigest: "sha256:request",
  },
  execution: {
    command: "echo mock batch",
    gateRequired: true,
    runsOn: "ubuntu-latest",
  },
  expiresAt: "2026-09-11T01:00:00.000Z",
  reason: "Close payments after reconciliation.",
  requestId: "btr-payment-101",
  requestLocator: "101",
  requestedAt: draft.requestedAt,
  requestedBy: "jane",
  sourceLabel: "Issue #101",
  sourceState: "OPEN",
  status: "REQUESTED",
  title: "Run batch payment.daily-close",
  triggerType: "MANUAL",
  updatedAt: draft.requestedAt,
  workflow: { path: draft.batch.workflowPath, ref: "main" },
  workspaceLabel: draft.workspaceLabel,
} satisfies ExecutionRequest;

const previewRequest = {
  ...createdRequest,
  attempts: undefined,
  capability: undefined,
  requestLocator: undefined,
  sourceLabel: undefined,
  sourceUrl: undefined,
};
