import { fireEvent, render, screen, within } from "@testing-library/react";
import type { BatchPlaneClient, ExecutionRequest } from "@batchplane/ui-client";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BatchPlaneClientContext } from "../../../../client/batch-plane-client-context";
import "../../../../i18n/i18n";
import { i18next } from "../../../../i18n/i18n";
import { ExecutionRequestDetailPage } from "./ExecutionRequestDetailPage";

describe("ExecutionRequestDetailPage", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("renders request detail and a link to its correlated run", async () => {
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
      screen.getByRole("link", { name: "View execution detail" }),
    ).toHaveAttribute("href", "/executions/204");
    expect(
      screen.getByRole("button", { name: "Approve execution" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
    expect(
      screen.getByText(
        "BatchPlane Gate is mandatory before the batch command.",
      ),
    ).toBeInTheDocument();
  });

  it.each([false, undefined])(
    "does not infer required Gate evidence from a target when gateRequired is %s",
    async (gateRequired) => {
      const detail = request();
      detail.batch.gateRequired = gateRequired;
      renderDetail(createClient({ getExecutionRequest: async () => detail }));

      expect(
        await screen.findByText("BatchPlane Gate evidence is missing."),
      ).toBeInTheDocument();
      expect(
        screen.getByText(".github/workflows/daily-close.yml@main"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          "BatchPlane Gate is mandatory before the batch command.",
        ),
      ).not.toBeInTheDocument();
    },
  );

  it("shows the post-create recovery notice when its request identity matches", async () => {
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

  it("renders the projected SELF_APPROVAL_ALLOWED notice", async () => {
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

  it.each([
    {
      language: "en",
      approve: "Approve execution",
      reason: "The request's requester identity could not be verified.",
      unavailableReason: "REQUESTER_IDENTITY_UNVERIFIED" as const,
      canReject: true,
    },
    {
      language: "ko",
      approve: "실행 승인",
      reason: "이 요청의 요청자 신원을 확인할 수 없습니다.",
      unavailableReason: "REQUESTER_IDENTITY_UNVERIFIED" as const,
      canReject: true,
    },
    {
      language: "en",
      approve: "Approve execution",
      reason: "An approver role is required to approve or reject.",
      unavailableReason: "APPROVER_ROLE_REQUIRED" as const,
      canReject: false,
    },
    {
      language: "ko",
      approve: "실행 승인",
      reason: "승인하거나 반려하려면 승인자 역할이 필요합니다.",
      unavailableReason: "APPROVER_ROLE_REQUIRED" as const,
      canReject: false,
    },
    {
      language: "en",
      approve: "Approve execution",
      reason: "Approval authority could not be verified.",
      unavailableReason: "AUTHORIZATION_UNAVAILABLE" as const,
      canReject: false,
    },
    {
      language: "ko",
      approve: "실행 승인",
      reason: "승인 권한을 확인할 수 없습니다.",
      unavailableReason: "AUTHORIZATION_UNAVAILABLE" as const,
      canReject: false,
    },
  ])(
    "keeps the request inspectable with disabled decision controls and the localized $unavailableReason reason in $language",
    async ({ language, approve, reason, unavailableReason, canReject }) => {
      await i18next.changeLanguage(language);
      const approveExecutionRequest = vi.fn();
      renderDetail(
        createClient({
          approveExecutionRequest,
          getExecutionRequest: async () =>
            request({
              capability: {
                canApprove: false,
                canReject,
                approveUnavailableReason: unavailableReason,
                ...(!canReject &&
                unavailableReason !== "REQUESTER_IDENTITY_UNVERIFIED"
                  ? { rejectUnavailableReason: unavailableReason }
                  : {}),
              },
            }),
        }),
      );
      const button = await screen.findByRole("button", { name: approve });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", reason);
      expect(screen.getByText(reason)).toBeInTheDocument();
      const reject = screen.getByRole("button", {
        name: language === "en" ? "Reject" : "반려",
      });
      if (canReject) expect(reject).toBeEnabled();
      else {
        expect(reject).toBeDisabled();
        expect(reject).toHaveAttribute("title", reason);
      }
      expect(
        screen.getByText("#101 Run batch payment.daily-close"),
      ).toBeInTheDocument();
      fireEvent.click(button);
      expect(approveExecutionRequest).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      language: "en",
      currentAuthorization: "DENIED",
      authority: "Not authorized by current Workspace policy",
      guidance:
        "Approval is recorded, but current Workspace policy does not authorize execution.",
    },
    {
      language: "ko",
      currentAuthorization: "DENIED",
      authority: "현재 Workspace 정책에서 허용되지 않는 결정",
      guidance:
        "승인 기록은 남아 있지만 현재 Workspace 정책으로는 실행이 허용되지 않습니다.",
    },
    {
      language: "en",
      currentAuthorization: "UNAVAILABLE",
      authority: "Approval authority could not be verified.",
      guidance:
        "Approval is recorded, but current execution authority could not be verified.",
    },
    {
      language: "ko",
      currentAuthorization: "UNAVAILABLE",
      authority: "승인 권한을 확인할 수 없습니다.",
      guidance: "승인 기록은 남아 있지만 현재 실행 권한을 확인할 수 없습니다.",
    },
  ] as const)(
    "preserves the approval record with $currentAuthorization guidance throughout the detail in $language, without promising dispatch",
    async ({ language, currentAuthorization, authority, guidance }) => {
      await i18next.changeLanguage(language);
      renderDetail(
        createClient({
          getExecutionRequest: async () =>
            request({
              attempts: { type: "loaded", attempts: [] },
              status: "APPROVED",
              approvalDecision: {
                actor: "auditor",
                decidedAt: "2026-09-11T09:01:00.000Z",
                decision: "APPROVED",
                reason: "",
                source: "USER",
                currentAuthorization,
              },
            }),
        }),
      );
      expect(
        await screen.findByText(`APPROVED by @auditor (${authority})`),
      ).toBeInTheDocument();
      expect(screen.getByTitle(guidance)).toHaveTextContent(
        language === "en" ? "Approval recorded" : "승인 기록됨",
      );
      const decisionTitle =
        language === "en" ? "No approval action" : "승인 작업 없음";
      for (const name of ["Dispatcher", decisionTitle]) {
        const region = screen
          .getByRole("heading", { name })
          .closest("article")!;
        expect(within(region).getByText(guidance)).toBeInTheDocument();
      }
      const waiting =
        language === "en"
          ? "Approval comment evidence exists. The dispatcher is expected to pick it up."
          : "승인 comment 증적이 존재합니다. Dispatcher가 이를 감지해야 합니다.";
      expect(screen.queryByText(waiting)).not.toBeInTheDocument();
      expect(screen.queryByTitle(waiting)).not.toBeInTheDocument();
    },
  );

  it("preserves recorded dispatch evidence and the execution link when current approval authority is denied", async () => {
    renderDetail(
      createClient({
        getExecutionRequest: async () =>
          request({
            status: "DISPATCHED",
            approvalDecision: {
              actor: "auditor",
              decidedAt: "2026-09-11T09:01:00.000Z",
              decision: "APPROVED",
              reason: "",
              source: "USER",
              currentAuthorization: "DENIED",
            },
          }),
      }),
    );
    expect(
      await screen.findByRole("link", { name: "View execution detail" }),
    ).toHaveAttribute("href", "/executions/204");
    expect(
      screen.getByTitle(
        "Dispatcher evidence says the batch workflow was dispatched.",
      ),
    ).toHaveTextContent("Dispatched");
    expect(
      screen.queryByText(
        "Approval is recorded, but current Workspace policy does not authorize execution.",
      ),
    ).not.toBeInTheDocument();
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
                  executionTarget: {
                    location: ".github/workflows/daily-close.yml",
                  },
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
      screen.getByRole("link", { name: "View execution detail" }),
    ).toHaveAttribute(
      "href",
      `/executions/${encodeURIComponent(occurrenceLocator)}`,
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
        await screen.findByRole("link", { name: "View execution detail" }),
      ).toHaveAttribute(
        "href",
        "/executions/native%3Abtr-schedule-a%3A900%3A2",
      );
      expect(
        screen.getByRole("link", { name: "900 Gate blocked" }),
      ).toHaveAttribute(
        "href",
        "/executions/native%3Abtr-schedule-a%3A900%3A2",
      );
    },
  );

  it("links the adapter-projected source change to registration request 42", async () => {
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
          executionTarget: {
            location: ".github/workflows/daily-close.yml",
          },
        },
      ],
      type: "loaded",
    },
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
      approvedBatchRevision: {
        governedChangeId: "bgc-payment-approved",
        targetRevisionDigest: "sha256:approved",
      },
      canonicalPayload: '{\n  "requestId": "btr-payment-101"\n}',
      requestDigest: "sha256:request-101",
    },
    executionTarget: {
      command: "echo mock batch",
      executionEnvironment: "ubuntu-latest",
      platformName: "GitHub Actions",
      targetName: ".github/workflows/daily-close.yml",
      targetRevision: "main",
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
    workspaceLabel: "Payments Workspace",
    ...overrides,
  };
}
