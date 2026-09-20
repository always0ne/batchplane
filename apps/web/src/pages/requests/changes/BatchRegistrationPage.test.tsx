import {
  WorkspaceNotConnectedError,
  type BatchChangeDraft,
  type BatchPlaneClient,
} from "@batchplane/ui-client";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchPlaneClientContext } from "../../../client/batch-plane-client-context";
import "../../../i18n/i18n";
import { i18next } from "../../../i18n/i18n";

import { BatchRegistrationPage } from "./BatchRegistrationPage";

const newBatchDraft: BatchChangeDraft = {
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

  it("bounds long workflow diffs inside shrinkable change-form columns without changing their text", async () => {
    const nextContent =
      "run-name: BatchPlane - Daily Close - ${{ github.event.inputs['batch-id'] || 'scheduled' }} - ${{ github.event.inputs.request_id || github.event.schedule }}\n";
    const draft: BatchChangeDraft = {
      ...newBatchDraft,
      batch: {
        ...newBatchDraft.batch,
        batchId: "payment.daily-close",
        domain: "payments",
        name: "Daily Close",
        owner: "ops-team",
      },
      execution: { ...newBatchDraft.execution, command: "echo close" },
      mode: "change",
    };
    renderPage(
      createClient({
        loadBatchChangeDraft: async () => draft,
        previewBatchChange: async () => ({
          ...preview(),
          files: [
            {
              baseContent: "run-name: BatchPlane - Daily Close\n",
              nextContent,
              path: ".github/workflows/payment.daily-close.yml",
              status: "MODIFIED",
            },
          ],
        }),
      }),
      "/batches/new?change=payment.daily-close",
    );

    const addedLine = await screen.findByText(`+ ${nextContent.trimEnd()}`);
    const diff = addedLine.closest("pre");
    const form = screen.getByLabelText("Batch ID").closest("form");
    expect(form).toHaveClass("min-w-0", "grid-cols-1");
    expect(form?.firstElementChild).toHaveClass("min-w-0");
    expect(form?.querySelector("aside")).toHaveClass("min-w-0");
    expect(diff).toHaveClass("min-w-0", "max-w-full", "overflow-auto");
    expect(diff?.closest("article")).toHaveClass("min-w-0");
    expect(addedLine.textContent).toBe(`+ ${nextContent.trimEnd()}`);
    expect(screen.getByLabelText("Workflow ref")).toHaveClass(
      "min-w-0",
      "w-full",
    );
    expect(screen.getByLabelText("Execution file")).toHaveClass(
      "min-w-0",
      "w-full",
    );
    expect(screen.getByLabelText("Batch command")).toHaveClass(
      "min-w-0",
      "w-full",
    );
  });

  it("keeps business, GitHub execution, and schedules in order and submits the uploaded file with the explicit command", async () => {
    const previewBatchChange = vi
      .fn<
        Parameters<BatchPlaneClient["previewBatchChange"]>,
        ReturnType<BatchPlaneClient["previewBatchChange"]>
      >()
      .mockResolvedValue(preview());
    const createBatchChangeRequest = vi
      .fn<
        Parameters<BatchPlaneClient["createBatchChangeRequest"]>,
        ReturnType<BatchPlaneClient["createBatchChangeRequest"]>
      >()
      .mockResolvedValue({ request: requestResult("42") });
    renderPage(createClient({ createBatchChangeRequest, previewBatchChange }));

    await screen.findByRole("heading", { name: "Registration" });
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .slice(0, 3)
        .map((heading) => heading.textContent),
    ).toEqual(["Batch definition", "Workflow", "Schedules"]);
    fillRequiredRegistrationFields();
    fireEvent.change(screen.getByLabelText("Workflow ref"), {
      target: { value: "release/close" },
    });
    const bytes = new Uint8Array([0, 1, 255]);
    const file = new File([bytes], "close.jar");
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn().mockResolvedValue(bytes.buffer),
    });
    fireEvent.change(screen.getByLabelText("Execution file"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(previewBatchChange.mock.lastCall?.[0].execution.upload).toEqual({
        bytes,
        fileName: "close.jar",
      });
    });
    expect(screen.getByLabelText("Batch command")).toHaveValue("echo close");
    expect(previewBatchChange.mock.lastCall?.[0]).toMatchObject({
      batch: {
        batchId: "payment.daily-close",
        domain: "payments",
        owner: "ops-team",
      },
      execution: {
        command: "echo close",
        platform: "GITHUB_ACTIONS",
        ref: "release/close",
      },
      governedChangeId: newBatchDraft.governedChangeId,
    });
    expect(previewBatchChange.mock.lastCall?.[0].batch).not.toHaveProperty(
      "runnerLabel",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create registration change" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create registration change" }),
    );
    await screen.findByText("Request 42 opened");
    expect(createBatchChangeRequest.mock.lastCall?.[0]).toEqual(
      previewBatchChange.mock.lastCall?.[0],
    );
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
    ).toHaveAttribute("href", "/workspace");
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
      },
      execution: { ...newBatchDraft.execution, command: "echo close" },
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
    await act(async () => {
      await i18next.changeLanguage("ko");
    });

    renderPage(createClient());

    expect(
      await screen.findByRole("heading", { name: "등록" }),
    ).toBeInTheDocument();
    expect(screen.getByText("스케줄")).toBeInTheDocument();
    expect(screen.getByText("배치 명령 전 Gate 필수 적용")).toBeInTheDocument();
  });

  it("applies the authenticated owner default when the actual owner input loses focus", async () => {
    renderPage(
      createClient({
        loadBatchChangeDraft: vi.fn().mockResolvedValue({
          ...newBatchDraft,
          batch: { ...newBatchDraft.batch, owner: "ops-team" },
          defaultOwner: "developer",
        }),
      }),
    );

    const owner = await screen.findByLabelText("Owner");
    fireEvent.change(owner, { target: { value: "" } });
    expect(owner).toHaveValue("");

    fireEvent.blur(owner);

    await waitFor(() => expect(owner).toHaveValue("developer"));
  });

  it("resets the loaded editor for a new client but preserves form state for a locale change", async () => {
    const firstClient = createClient({
      loadBatchChangeDraft: vi.fn().mockResolvedValue({
        ...newBatchDraft,
        batch: { ...newBatchDraft.batch, name: "First draft" },
      }),
    });
    const secondClient = createClient({
      loadBatchChangeDraft: vi.fn().mockResolvedValue({
        ...newBatchDraft,
        batch: { ...newBatchDraft.batch, name: "Replacement draft" },
      }),
    });
    const page = renderPage(firstClient);

    expect(await screen.findByDisplayValue("First draft")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Unsaved edit" },
    });

    page.rerender(pageTree(secondClient));
    expect(
      await screen.findByDisplayValue("Replacement draft"),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Unsaved edit")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Locale-preserved edit" },
    });
    await i18next.changeLanguage("ko");

    expect(
      screen.getByDisplayValue("Locale-preserved edit"),
    ).toBeInTheDocument();
    await act(async () => {
      await i18next.changeLanguage("en");
    });
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
          execution: expect.objectContaining({
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
      },
      execution: { ...newBatchDraft.execution, command: "echo close" },
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
    expect(screen.getByLabelText("Cron")).toBeDisabled();
    expect(screen.getByLabelText("Timezone")).toBeDisabled();
    expect(screen.getByLabelText("Enabled")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo delete" }));
    expect(screen.getByLabelText("Cron")).toBeEnabled();
    expect(screen.getByLabelText("Timezone")).toBeEnabled();
    expect(screen.getByLabelText("Enabled")).toBeEnabled();
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
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Execution file")).not.toBeInTheDocument();
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
  return render(pageTree(client, path));
}

function pageTree(client: BatchPlaneClient, path = "/batches/new") {
  return (
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
    </BatchPlaneClientContext.Provider>
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
    getBatchDetail: async ({ batchId }) => ({ batchId, type: "not-found" }),
    getBatchChangeBlocker: async () => null,
    getBatchRemediationCapability: async () => ({
      availableKinds: [],
      canRequest: false,
    }),
    getGovernedChange: async () => requestDetail(),
    listBatches: async () => ({
      batches: [],
      sourceRevision: "main",
      type: "loaded",
    }),
    loadBatchChangeDraft: async () => newBatchDraft,
    previewBatchChange: async () => preview(),
    requestBatchRemediation: async () => ({ request: requestResult("42") }),
    rejectGovernedChange: async () => requestDetail(),
    withdrawGovernedChange: async () => requestDetail(),
    loadExecutionRequestDraft: unsupported,
    previewExecutionRequest: unsupported,
    createExecutionRequest: unsupported,
    getExecutionRequest: unsupported,
    approveExecutionRequest: unsupported,
    rejectExecutionRequest: unsupported,
    listApprovalRequests: unsupported,
    listWorkspaceRequests: unsupported,
    getMyWork: unsupported,
    listExecutionRuns: unsupported,
    inspectWorkspace: unsupported,
    requestWorkspaceInstallation: unsupported,
    requestWorkspaceUpdate: unsupported,
    requestWorkspacePolicyChange: unsupported,
    getExecutionRun: unsupported,
    getExecutionRunJobLog: unsupported,
    createFailureFollowUp: unsupported,
    reviewFailureFollowUp: unsupported,
    listAuditTimeline: unsupported,
    getDashboardSummary: unsupported,
    ...overrides,
  };
}

async function unsupported(): Promise<never> {
  throw new Error(
    "This client method is not used by the batch registration test.",
  );
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
