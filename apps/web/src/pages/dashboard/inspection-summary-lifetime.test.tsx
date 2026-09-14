import type {
  DashboardSummary,
  ExecutionAuditItem,
} from "@batchplane/ui-client";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import { i18next } from "../../i18n/i18n";
import { deferred, inspectionTestClient } from "../../test/inspection-client";
import { AuditPage } from "../audit/AuditPage";
import { DashboardPage } from "./DashboardPage";

const gate: ExecutionAuditItem = {
  actor: "manager",
  itemId: "gate",
  occurredAt: "2026-09-11T00:00:00Z",
  subjectId: "request",
  subjectType: "EXECUTION_REQUEST",
  summary: "Recorded Gate",
  type: "GATE_DECIDED",
  metadata: { batchId: "ledger", gateResult: "ALLOWED" },
};
const summary: DashboardSummary = {
  workspace: {
    label: "Product Workspace",
    currentUser: "manager",
    defaultRevision: "main",
  },
  installation: {
    installed: true,
    missingCount: 0,
    presentCount: 1,
    requiredCount: 1,
  },
  batchCount: 2,
  pendingApprovals: [],
  failedRunCount: 1,
  gateBlockedRunCount: 1,
  auditItems: [gate],
};
describe("summary query lifetime", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });
  it("localizes the shared audit summary under Dashboard without a second read", async () => {
    const get = vi.fn(async () => summary);
    const client = inspectionTestClient({ getDashboardSummary: get });
    render(
      <BatchPlaneClientContext.Provider value={client}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </BatchPlaneClientContext.Provider>,
    );
    expect(
      await screen.findByText("Gate allowed for ledger"),
    ).toBeInTheDocument();
    await act(() => i18next.changeLanguage("ko"));
    expect(screen.queryByText(/values\.gateResult/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        i18next.t("audit:summaries.GATE_DECIDED", {
          gateResult: i18next.t("audit:values.gateResult.ALLOWED"),
          batchId: "ledger",
        }),
      ),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
  });
  it("ignores an old Dashboard client result", async () => {
    const pending = deferred<DashboardSummary>();
    const first = inspectionTestClient({
      getDashboardSummary: () => pending.promise,
    });
    const second = inspectionTestClient({
      getDashboardSummary: async () => summary,
    });
    function view(client: typeof first) {
      return (
        <BatchPlaneClientContext.Provider value={client}>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </BatchPlaneClientContext.Provider>
      );
    }
    const rendered = render(view(first));
    rendered.rerender(view(second));
    await screen.findByText("Product Workspace");
    await act(async () =>
      pending.resolve({
        ...summary,
        workspace: { ...summary.workspace, label: "Old Workspace" },
      }),
    );
    expect(screen.queryByText("Old Workspace")).not.toBeInTheDocument();
  });
  it("keeps Audit filters on language change, performs real refresh, and exposes read errors", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce([gate])
      .mockRejectedValueOnce(new Error("Audit unavailable"));
    const client = inspectionTestClient({ listAuditTimeline: list });
    render(
      <BatchPlaneClientContext.Provider value={client}>
        <MemoryRouter>
          <AuditPage />
        </MemoryRouter>
      </BatchPlaneClientContext.Provider>,
    );
    await screen.findByText("Gate allowed for ledger");
    fireEvent.change(screen.getByLabelText("Batch"), {
      target: { value: "ledger" },
    });
    await act(() => i18next.changeLanguage("ko"));
    expect(screen.getByDisplayValue("ledger")).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Audit unavailable",
    );
    expect(list).toHaveBeenCalledTimes(2);
  });
});
