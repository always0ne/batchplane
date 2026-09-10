import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  WorkspaceNotConnectedError,
  type BatchChangeDraft,
  type BatchPlaneClient,
} from "@batchplane/ui-client";
import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import "../../i18n/i18n";
import { i18next } from "../../i18n/i18n";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BatchRegistrationPage } from "./BatchRegistrationPage";

const newBatchDraft: BatchChangeDraft = {
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
  governedChangeId: "bgc-test-new-batch",
  mode: "create",
  schedules: [],
};

describe("BatchRegistrationPage", () => {
  afterEach(async () => {
    await i18next.changeLanguage("en");
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("creates a governed registration request from the actual product preview", async () => {
    const createBatchChangeRequest = vi.fn().mockResolvedValue({
      request: requestResult("42"),
    });
    const previewBatchChange = vi.fn().mockResolvedValue(preview());

    renderPage(createClient({ createBatchChangeRequest, previewBatchChange }));

    await screen.findByRole("heading", { name: "Registration" });
    fillRequiredRegistrationFields();

    await waitFor(() => expect(previewBatchChange).toHaveBeenCalled());
    fireEvent.click(
      screen.getByRole("button", { name: "Create registration change" }),
    );

    expect(await screen.findByText("Request 42 opened")).toBeInTheDocument();
    expect(createBatchChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "create" }),
    );
  });

  it("routes a disconnected Workspace to setup instead of showing a load failure", async () => {
    renderPage(
      createClient({
        loadBatchChangeDraft: vi
          .fn()
          .mockRejectedValue(new WorkspaceNotConnectedError()),
      }),
    );

    expect(
      await screen.findByText(
        "Connect a Workspace before loading change mode.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Workspace" }),
    ).toHaveAttribute("href", "/lite/setup");
  });

  it("keeps schedule add and deletion inside the batch change draft", async () => {
    const previewBatchChange = vi.fn().mockResolvedValue(preview());
    const changedDraft: BatchChangeDraft = {
      ...newBatchDraft,
      batch: {
        ...newBatchDraft.batch,
        batchId: "payment.daily-close",
        domain: "payments",
        name: "Daily Close",
        owner: "ops-team",
        runCommand: "echo close",
      },
      mode: "change",
      schedules: [
        {
          cron: "0 5 * * *",
          enabled: true,
          name: "Daily close",
          scheduleId: "daily-close",
          timezone: "Asia/Seoul",
        },
      ],
    };

    renderPage(
      createClient({
        loadBatchChangeDraft: vi.fn().mockResolvedValue(changedDraft),
        previewBatchChange,
      }),
      "/batches/new?change=payment.daily-close",
    );

    expect(await screen.findByDisplayValue("daily-close")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      const draft = previewBatchChange.mock.calls.at(
        -1,
      )?.[0] as BatchChangeDraft;
      expect(draft.schedules).toEqual([]);
    });
    expect(
      screen.queryByText("Schedule definition path"),
    ).not.toBeInTheDocument();
  });

  it("loads Korean registration essentials through the same client contract", async () => {
    await i18next.changeLanguage("ko");

    renderPage(createClient());

    expect(
      await screen.findByRole("heading", { name: "등록" }),
    ).toBeInTheDocument();
    expect(screen.getByText("스케줄")).toBeInTheDocument();
    expect(screen.getByText("배치 명령 전 Gate 필수 적용")).toBeInTheDocument();
  });

  it("keeps custom multi-label runners in the governed change draft", async () => {
    const createBatchChangeRequest = vi.fn().mockResolvedValue({
      request: requestResult("43"),
    });
    renderPage(createClient({ createBatchChangeRequest }));

    await screen.findByRole("heading", { name: "Registration" });
    fillRequiredRegistrationFields();
    fireEvent.change(screen.getByLabelText("Execution environment"), {
      target: { value: "CUSTOM" },
    });
    fireEvent.change(screen.getByLabelText("Custom runner label"), {
      target: { value: "self-hosted, linux, x64" },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create registration change" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create registration change" }),
    );

    await waitFor(() => {
      expect(createBatchChangeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          batch: expect.objectContaining({
            runnerLabel: "self-hosted, linux, x64",
          }),
        }),
      );
    });
  });

  it("adds, edits, removes, and restores schedules inside one change draft", async () => {
    const previewBatchChange = vi.fn().mockResolvedValue(preview());
    const changedDraft: BatchChangeDraft = {
      ...newBatchDraft,
      batch: {
        ...newBatchDraft.batch,
        batchId: "payment.daily-close",
        domain: "payments",
        name: "Daily Close",
        owner: "ops-team",
        runCommand: "echo close",
      },
      mode: "change",
      schedules: [schedule("daily-close")],
    };
    renderPage(
      createClient({
        loadBatchChangeDraft: vi.fn().mockResolvedValue(changedDraft),
        previewBatchChange,
      }),
      "/batches/new?change=payment.daily-close",
    );

    await screen.findByDisplayValue("daily-close");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Pending delete")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Add schedule" }));

    fireEvent.change(screen.getAllByPlaceholderText("daily-close").at(-1)!, {
      target: { value: "monthly-close" },
    });
    fireEvent.change(screen.getAllByPlaceholderText("Daily close").at(-1)!, {
      target: { value: "Monthly close" },
    });
    fireEvent.change(screen.getAllByPlaceholderText("0 5 * * *").at(-1)!, {
      target: { value: "0 6 1 * *" },
    });

    await waitFor(() => {
      const draft = previewBatchChange.mock.calls.at(
        -1,
      )?.[0] as BatchChangeDraft;
      expect(draft.schedules).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ scheduleId: "daily-close" }),
          expect.objectContaining({
            cron: "0 6 1 * *",
            name: "Monthly close",
            scheduleId: "monthly-close",
          }),
        ]),
      );
    });
  });

  it("shows all cron preview times and the localized parse error", async () => {
    renderPage(createClient());
    await screen.findByRole("heading", { name: "Registration" });
    fireEvent.click(screen.getByRole("button", { name: "Add schedule" }));

    expect(screen.getByText("Expected run times")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.change(screen.getByPlaceholderText("0 5 * * *"), {
      target: { value: "not a cron" },
    });
    expect(
      await screen.findByText("Cron expression is invalid."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Timezone"), {
      target: { value: "Mars/Seoul" },
    });
    expect(await screen.findByText("Timezone is invalid.")).toBeInTheDocument();
  });

  it("renders cron preview dates in the schedule timezone", async () => {
    vi.stubEnv("TZ", "UTC");

    renderPage(createClient());
    await screen.findByRole("heading", { name: "Registration" });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T00:00:00.000Z"));
    fireEvent.click(screen.getByRole("button", { name: "Add schedule" }));

    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(
      new Date("2026-05-13T20:00:00.000Z").toLocaleString("en", {
        timeZone: "Asia/Seoul",
      }),
    );
  });

  it("blocks a no-op preview with an accessible reason", async () => {
    renderPage(
      createClient({
        previewBatchChange: vi.fn().mockResolvedValue({
          files: [{ path: "batch.yml", status: "UNCHANGED" }],
          hasEffectiveChanges: false,
          targetRevisionDigest: "sha256:no-op",
        }),
      }),
    );
    await screen.findByRole("heading", { name: "Registration" });
    fillRequiredRegistrationFields();

    const button = await screen.findByRole("button", {
      name: "Create registration change",
    });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute(
      "title",
      "No governed file changes were detected.",
    );
  });

  it("creates a deletion change from the loaded batch draft", async () => {
    const createBatchChangeRequest = vi.fn().mockResolvedValue({
      request: requestResult("44"),
    });
    renderPage(
      createClient({
        createBatchChangeRequest,
        loadBatchChangeDraft: vi.fn().mockResolvedValue({
          ...newBatchDraft,
          batch: {
            ...newBatchDraft.batch,
            batchId: "payment.daily-close",
            name: "Daily Close",
          },
          mode: "delete",
        }),
      }),
      "/batches/new?delete=payment.daily-close",
    );

    await screen.findByRole("heading", { name: "Delete batch" });
    fireEvent.click(
      screen.getByRole("button", { name: "Create deletion request" }),
    );

    await waitFor(() =>
      expect(createBatchChangeRequest).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "delete" }),
      ),
    );
  });
});

function renderPage(client: BatchPlaneClient, path = "/batches/new") {
  render(
    <BatchPlaneClientContext.Provider value={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/batches/new" element={<BatchRegistrationPage />} />
          <Route
            path="/approvals/registration/:requestLocator"
            element={<p>Request 42 opened</p>}
          />
        </Routes>
      </MemoryRouter>
    </BatchPlaneClientContext.Provider>,
  );
}

function fillRequiredRegistrationFields() {
  fireEvent.change(screen.getByLabelText("Batch ID"), {
    target: { value: "payment.daily-close" },
  });
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Daily Close" },
  });
  fireEvent.change(screen.getByLabelText("Owner"), {
    target: { value: "ops-team" },
  });
  fireEvent.change(screen.getByLabelText("Domain"), {
    target: { value: "payments" },
  });
  fireEvent.change(screen.getByLabelText("Batch command"), {
    target: { value: "echo close" },
  });
}

function createClient(
  overrides: Partial<BatchPlaneClient> = {},
): BatchPlaneClient {
  return {
    approveGovernedChange: async () => requestDetail(),
    createBatchChangeRequest: async () => ({ request: requestResult("42") }),
    getBatchChangeBlocker: async () => null,
    getGovernedChange: async () => requestDetail(),
    listBatches: async () => ({
      batches: [],
      sourceRevision: "main",
      type: "loaded",
    }),
    loadBatchChangeDraft: async () => newBatchDraft,
    previewBatchChange: async () => preview(),
    rejectGovernedChange: async () => requestDetail(),
    withdrawGovernedChange: async () => requestDetail(),
    ...overrides,
  };
}

function preview() {
  return {
    files: [
      {
        baseContent: "",
        nextContent: "kind: BatchDefinition\n",
        path: ".batch-governance/batches/payment.daily-close.yml",
        status: "ADDED" as const,
      },
    ],
    hasEffectiveChanges: true,
    targetRevisionDigest: "sha256:preview",
  };
}

function schedule(scheduleId: string) {
  return {
    cron: "0 5 * * *",
    enabled: true,
    name: "Daily close",
    scheduleId,
    timezone: "Asia/Seoul",
  };
}

function requestResult(requestLocator: string) {
  return {
    batchId: "payment.daily-close",
    evidence: {
      governedChangeId: "bgc-test",
      kind: "VERIFIED_V2" as const,
      requestDigest: "sha256:test",
      targetRevisionDigest: "sha256:target",
    },
    mode: "REGISTER" as const,
    requestLocator,
    requester: "developer",
    reviewState: "OPEN" as const,
    sourceLabel: `#${requestLocator}`,
    title: "Register batch payment.daily-close",
  };
}

function requestDetail() {
  return {
    ...requestResult("42"),
    canApprove: true,
    canApplyApprovedChange: false,
    canReject: true,
    canWithdraw: true,
    files: preview().files,
  };
}
