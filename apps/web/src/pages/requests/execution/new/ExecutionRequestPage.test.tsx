import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  BatchPlaneClient,
  ExecutionRequest,
  ExecutionRequestDraft,
} from "@batchplane/ui-client";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BatchPlaneClientContext } from "../../../../client/batch-plane-client-context";
import "../../../../i18n/i18n";
import { i18next } from "../../../../i18n/i18n";
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
    executionTarget: {
      command: "echo mock batch",
      executionEnvironment: "ubuntu-latest",
      platformName: "GitHub Actions",
      targetName: ".github/workflows/daily-close.yml",
      targetRevision: "main",
    },
    gateRequired: true,
    name: "Daily Close",
    owner: "ops-team",
    status: "ACTIVE",
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

  it("previews and creates from the loaded draft, then navigates to the returned request locator", async () => {
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
    expect(previewExecutionRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ draft }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create execution request" }),
    );

    expect(await screen.findByText("Detail 101")).toBeInTheDocument();
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

  it("previews and submits approved-definition selections with exact empty and multiline values and no editable flags", async () => {
    const parameterDraft: ExecutionRequestDraft = {
      ...draft,
      sensitiveInputsAvailable: true,
      parameters: [
        { name: "Report", required: true, sensitive: false },
        {
          name: "Token",
          required: true,
          sensitive: true,
          defaultValue: { kind: "SAVED", reference: "opaque-default" },
        },
        { name: "Optional", required: false, sensitive: false },
      ],
    };
    const previewExecutionRequest = vi
      .fn<
        Parameters<BatchPlaneClient["previewExecutionRequest"]>,
        ReturnType<BatchPlaneClient["previewExecutionRequest"]>
      >()
      .mockResolvedValue({ request: previewRequest });
    const createExecutionRequest = vi
      .fn<
        Parameters<BatchPlaneClient["createExecutionRequest"]>,
        ReturnType<BatchPlaneClient["createExecutionRequest"]>
      >()
      .mockResolvedValue({ request: createdRequest });
    renderPage(
      createClient({
        loadExecutionRequestDraft: async () => ({
          draft: parameterDraft,
          type: "ready",
        }),
        previewExecutionRequest,
        createExecutionRequest,
      }),
    );
    const source = await screen.findByLabelText("Source for Report");
    expect(previewExecutionRequest).not.toHaveBeenCalled();
    fireEvent.change(source, { target: { value: "VALUE" } });
    fireEvent.change(screen.getByLabelText("Source for Optional"), {
      target: { value: "VALUE" },
    });
    const exact = " 001\n한글\n ";
    fireEvent.change(screen.getByLabelText("Value for Report"), {
      target: { value: exact },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create execution request" }),
      ).toBeEnabled(),
    );
    const selections = [
      {
        name: "Report",
        source: "VALUE",
        value: { kind: "VALUE", value: exact },
      },
      { name: "Token", source: "DEFAULT" },
      {
        name: "Optional",
        source: "VALUE",
        value: { kind: "VALUE", value: "" },
      },
    ];
    expect(previewExecutionRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        draft: parameterDraft,
        parameters: selections,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create execution request" }),
    );
    expect(await screen.findByText("Detail 101")).toBeInTheDocument();
    expect(createExecutionRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: parameterDraft,
        parameters: selections,
      }),
    );
  });

  it("blocks an outdated parameter workflow with an internal batch-update link", async () => {
    const previewExecutionRequest = vi.fn(async () => ({
      request: previewRequest,
    }));
    renderPage(
      createClient({
        loadExecutionRequestDraft: async () => ({
          draft: {
            ...draft,
            creationCapability: {
              canCreate: false,
              unavailableReasons: ["PARAMETER_WORKFLOW_UPDATE_REQUIRED"],
            },
          },
          type: "ready",
        }),
        previewExecutionRequest,
      }),
    );
    const link = await screen.findByRole("link", {
      name: "Request batch update",
    });
    expect(link).toHaveAttribute(
      "href",
      "/batches/new?change=payment.daily-close",
    );
    expect(
      screen.getByRole("button", { name: "Create execution request" }),
    ).toBeDisabled();
    expect(previewExecutionRequest).not.toHaveBeenCalled();
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

  it.each([
    { reason: undefined, required: true },
    { reason: "KEY_NOT_REGISTERED" as const, required: true },
    { reason: "STATUS_UNAVAILABLE" as const, required: false },
  ])(
    "renders adapter-projected readiness and prevents submission ($reason)",
    async ({ reason, required }) => {
      const unavailableDraft: ExecutionRequestDraft = reason
        ? {
            ...draft,
            sensitiveInputsAvailable: false,
            sensitiveInputsUnavailableReason: reason,
            parameters: [
              {
                name: "Token",
                required,
                sensitive: true,
                defaultValue: { kind: "SAVED", reference: "opaque-default" },
              },
            ],
          }
        : {
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
      const previewExecutionRequest = vi.fn(async () => ({
        request: previewRequest,
      }));
      const createExecutionRequest = vi.fn(async () => ({
        request: createdRequest,
      }));
      renderPage(
        createClient({
          loadExecutionRequestDraft: async () => ({
            draft: unavailableDraft,
            type: "ready",
          }),
          previewExecutionRequest,
          createExecutionRequest,
        }),
      );

      if (reason) {
        expect(await screen.findByText("Protected value")).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Workspace readiness must be verified to use a sensitive value for Token.",
        );
        expect(
          screen.getByText(
            reason === "KEY_NOT_REGISTERED"
              ? "The Workspace protection key is not registered."
              : "Workspace sensitive input readiness could not be verified. Check access and try again.",
          ),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("link", { name: "Open Workspace" }),
        ).toHaveAttribute("href", "/workspace");
        expect(screen.getByLabelText("Source for Token")).toHaveValue(
          "DEFAULT",
        );
        expect(
          within(screen.getByLabelText("Source for Token")).getByRole(
            "option",
            { name: "Specify a value" },
          ),
        ).toBeDisabled();
        expect(screen.queryByText("opaque-default")).not.toBeInTheDocument();
      } else {
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
      }
      expect(
        screen.getByRole("button", { name: "Create execution request" }),
      ).toBeDisabled();
      fireEvent.click(
        screen.getByRole("button", { name: "Create execution request" }),
      );
      expect(previewExecutionRequest).not.toHaveBeenCalled();
      expect(createExecutionRequest).not.toHaveBeenCalled();
      if (reason && !required) {
        fireEvent.change(screen.getByLabelText("Source for Token"), {
          target: { value: "OMIT" },
        });
        await waitFor(() =>
          expect(
            screen.getByRole("button", { name: "Create execution request" }),
          ).toBeEnabled(),
        );
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(previewExecutionRequest).toHaveBeenLastCalledWith(
          expect.objectContaining({
            parameters: [{ name: "Token", source: "OMIT" }],
          }),
        );
        expect(createExecutionRequest).not.toHaveBeenCalled();
      }
    },
  );

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
  const { requestLocator } = useParams();
  return <p>Detail {requestLocator}</p>;
}

const createdRequest = {
  approvalDecision: undefined,
  attempts: { attempts: [], type: "loaded" },
  batch: {
    criticality: "HIGH",
    domain: "payments",
    environment: "PROD",
    gateRequired: true,
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
  executionTarget: draft.batch.executionTarget,
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
