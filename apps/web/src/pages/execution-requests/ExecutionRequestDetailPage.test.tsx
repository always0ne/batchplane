import { fireEvent, render, screen } from "@testing-library/react";
import type { BatchPlaneClient, ExecutionRequest } from "@batchplane/ui-client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import "../../i18n/i18n";
import { i18next } from "../../i18n/i18n";
import { ExecutionRequestDetailPage } from "./ExecutionRequestDetailPage";

describe("ExecutionRequestDetailPage", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("renders product-projected request detail and navigates to the correlated run", async () => {
    renderDetail(createClient());

    expect(
      await screen.findByRole("heading", { name: "Execution request detail" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "#101 Run batch payment.daily-close",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Payments Workspace")).toBeInTheDocument();
    expect(screen.getByText("Source request status")).toBeInTheDocument();
    expect(screen.getByText("OPEN")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View run detail" }),
    ).toHaveAttribute("href", "/execution-runs/204");
    expect(
      screen.getByRole("button", { name: "Approve execution" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("keeps a post-create recovery notice identity-bound to the returned request", async () => {
    renderDetail(createClient(), {
      createdExecutionRequest: request(),
      executionRequestPostCreateError: {
        code: "AUTO_APPROVAL_RECORDING_FAILED",
        requestDigest: "sha256:request-101",
        requestId: "btr-payment-101",
        requestLocator: "101",
      },
    });

    expect(
      await screen.findByText(
        "Auto-approval evidence was not recorded for this execution request.",
      ),
    ).toBeInTheDocument();
  });

  it("shows that a created pending request is awaiting its latest status", async () => {
    renderDetail(createClient({ getExecutionRequest: async () => null }), {
      createdExecutionRequest: request(),
    });

    expect(
      await screen.findByText(
        "The request is recorded. Awaiting the latest processing status.",
      ),
    ).toBeInTheDocument();
  });

  it("shows that the last confirmed result is displayed when the read fails", async () => {
    renderDetail(
      createClient({
        getExecutionRequest: async () =>
          Promise.reject(new Error("temporarily unavailable")),
      }),
      { createdExecutionRequest: request() },
    );

    expect(
      await screen.findByText(
        "The latest status could not be checked. Showing the last confirmed result.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the product-projected self-approval notice without deriving policy", async () => {
    renderDetail(
      createClient({
        getExecutionRequest: async () =>
          request({
            approvalNotice: {
              kind: "SELF_APPROVAL_ALLOWED",
              mode: "SELF_APPROVAL_ALLOWED",
            },
          }),
      }),
    );

    expect(
      await screen.findByText(
        "Self-approval is enabled by Workspace policy (SELF_APPROVAL_ALLOWED). This approval will still be recorded as self-approval evidence.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the localized failure fallback for a non-Error approval rejection", async () => {
    renderDetail(
      createClient({
        approveExecutionRequest: vi.fn(async () => Promise.reject("offline")),
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Approve execution" }),
    );

    expect(
      await screen.findByText("Failed to record approval decision."),
    ).toBeInTheDocument();
  });

  it("renders a scheduled request as a recorded occurrence without approval or dispatcher claims", async () => {
    const occurrenceLocator = `native:btr-schedule-${"a".repeat(64)}:900:2`;
    renderDetail(
      createClient({
        getExecutionRequest: async () =>
          request({
            attempts: {
              attempts: [
                {
                  attempt: 2,
                  attemptLocator: occurrenceLocator,
                  nativeSchedule: {
                    observation: "BLOCKED",
                    scheduleId: "weekday-close",
                    sourceRunAttempt: 2,
                    sourceRunId: "900",
                  },
                  requestId: "btr-payment-101",
                  sourceLabel: "Native schedule occurrence",
                  status: "BLOCKED",
                  workflow: { path: ".github/workflows/daily-close.yml" },
                },
              ],
              type: "loaded",
            },
            capability: { canApprove: true, canReject: true },
            status: "REQUESTED",
            triggerType: "SCHEDULE",
          }),
      }),
    );

    expect(
      (await screen.findAllByText("Scheduled occurrence recorded")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Back to request inventory" }),
    ).toHaveAttribute("href", "/requests");
    expect(
      screen.getByRole("link", { name: "View run detail" }),
    ).toHaveAttribute(
      "href",
      `/execution-runs/${encodeURIComponent(occurrenceLocator)}`,
    );
    expect(
      screen.queryByRole("button", { name: "Approve execution" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Approval evidence")).not.toBeInTheDocument();
    expect(screen.queryByText("Dispatcher evidence")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "No approval action" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/record approval evidence/),
    ).not.toBeInTheDocument();
  });

  it("keeps an unresolved source revision inspectable without inventing a route", async () => {
    renderDetail(createClient());
    expect(
      await screen.findByText("bgc-payment-approved (sha256:approved)"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Source change")).not.toBeInTheDocument();
    expect(
      screen
        .queryAllByRole("link")
        .some((link) =>
          link.getAttribute("href")?.startsWith("/approvals/registration/"),
        ),
    ).toBe(false);
  });

  it.each([undefined, "2026-09-11T01:02:00.000Z"])(
    "opens the later observed attempt when attempt timestamps tie (%s)",
    async (completedAt) => {
      const first = {
        attempt: 1,
        attemptLocator: "native:btr-schedule-a:900:1",
        completedAt,
        requestId: "btr-payment-101",
        sourceLabel: "900",
        status: "SUCCEEDED" as const,
        workflow: {},
      };
      renderDetail(
        createClient({
          getExecutionRequest: async () =>
            request({
              triggerType: "SCHEDULE",
              attempts: {
                type: "loaded",
                attempts: [
                  first,
                  {
                    ...first,
                    attempt: 2,
                    attemptLocator: "native:btr-schedule-a:900:2",
                    status: "BLOCKED",
                  },
                ],
              },
            }),
        }),
      );
      expect(
        await screen.findByRole("link", { name: "View run detail" }),
      ).toHaveAttribute(
        "href",
        "/execution-runs/native%3Abtr-schedule-a%3A900%3A2",
      );
      expect(
        screen.getByRole("link", { name: "900 Gate blocked" }),
      ).toHaveAttribute(
        "href",
        "/execution-runs/native%3Abtr-schedule-a%3A900%3A2",
      );
    },
  );

  it("links a uniquely resolved approved source change at its registration request locator", async () => {
    renderDetail(
      createClient({
        getExecutionRequest: async () =>
          request({
            evidence: {
              ...request().evidence,
              sourceChange: {
                label: "PR #42",
                requestLocator: "42",
              },
            },
          }),
      }),
    );

    expect(await screen.findByText("Source change")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PR #42" })).toHaveAttribute(
      "href",
      "/approvals/registration/42",
    );
  });
});

function renderDetail(client: BatchPlaneClient, state?: unknown) {
  render(
    <BatchPlaneClientContext.Provider value={client}>
      <MemoryRouter
        initialEntries={[{ pathname: "/execution-requests/101", state }]}
      >
        <Routes>
          <Route
            element={<ExecutionRequestDetailPage />}
            path="/execution-requests/:requestLocator"
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
    approveExecutionRequest: async () => request({ status: "APPROVED" }),
    getExecutionRequest: async () => request(),
    rejectExecutionRequest: async () => request({ status: "REJECTED" }),
    ...overrides,
  } as BatchPlaneClient;
}

function request(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    attempts: {
      attempts: [
        {
          attempt: 1,
          attemptLocator: "204",
          requestId: "btr-payment-101",
          sourceLabel: "204",
          status: "SUCCEEDED",
          workflow: { path: ".github/workflows/daily-close.yml" },
        },
      ],
      type: "loaded",
    },
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
      approvedBatchRevision: {
        governedChangeId: "bgc-payment-approved",
        targetRevisionDigest: "sha256:approved",
      },
      canonicalPayload: '{\n  "requestId": "btr-payment-101"\n}',
      requestDigest: "sha256:request-101",
    },
    execution: {
      command: "echo mock batch",
      gateRequired: true,
      runsOn: "ubuntu-latest",
    },
    expiresAt: "2026-09-11T01:00:00.000Z",
    reason: "Close payments.",
    requestId: "btr-payment-101",
    requestLocator: "101",
    requestedAt: "2026-09-11T00:00:00.000Z",
    requestedBy: "jane",
    sourceLabel: "Source request #101",
    sourceState: "OPEN",
    sourceUrl: "https://example.test/requests/101",
    status: "REQUESTED",
    title: "#101 Run batch payment.daily-close",
    triggerType: "MANUAL",
    updatedAt: "2026-09-11T00:00:00.000Z",
    workflow: { path: ".github/workflows/daily-close.yml", ref: "main" },
    workspaceLabel: "Payments Workspace",
    ...overrides,
  };
}
