import type {
  BatchPlaneClient,
  ExecutionJobLog,
  ExecutionRunPresentation,
  FailureFollowUp,
} from "@batchplane/ui-client";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BatchPlaneClientContext } from "../client/batch-plane-client-context";
import { i18next } from "../i18n/i18n";
import { deferred, inspectionTestClient } from "./inspection-client";
import { ExecutionDetailPage } from "../pages/executions/detail/ExecutionDetailPage";
import { ExecutionListPage } from "../pages/executions/list/ExecutionListPage";

function run(id: string): ExecutionRunPresentation {
  return {
    runId: id,
    batchId: "batch." + id,
    requestId: "request." + id,
    status: "FAILED",
    executionTarget: { name: "Business " + id },
    gateDecision: {
      allowed: true,
      decidedAt: "2026-09-11T00:00:00Z",
      message: "Allowed",
    },
    jobs: [
      {
        jobId: "job." + id,
        name: "Provider-neutral command",
        role: "BUSINESS",
        status: "FAILED",
      },
    ],
  };
}
function followUp(id: string): FailureFollowUp {
  return {
    actionTaken: "Returned action",
    author: "requester",
    batchId: "batch." + id,
    createdAt: "2026-09-11T00:00:00Z",
    explanation: "Authoritative saved explanation",
    followUpId: "follow." + id,
    owner: "owner",
    requestId: "request." + id,
    runId: id,
    reviewStatus: "AWAITING_REVIEW",
    reviews: [],
    status: "RESOLVED",
  };
}
function Harness({
  client,
  other,
  children,
}: {
  client: BatchPlaneClient;
  other?: BatchPlaneClient;
  children: ReactNode;
}) {
  const [active, setActive] = useState(client);
  return (
    <BatchPlaneClientContext.Provider value={active}>
      <button onClick={() => other && setActive(other)}>Switch client</button>
      {children}
    </BatchPlaneClientContext.Provider>
  );
}
function Navigate() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate("/executions/second?runAttempt=2")}>
        Next run
      </button>
      <button onClick={() => navigate("/executions")}>Execution list</button>
    </>
  );
}
function mount(client: BatchPlaneClient, other?: BatchPlaneClient) {
  return render(
    <Harness client={client} other={other}>
      <MemoryRouter initialEntries={["/executions/first?from=failures#logs"]}>
        <Navigate />
        <Routes>
          <Route
            path="/executions/:executionId"
            element={<ExecutionDetailPage />}
          />
          <Route path="/executions" element={<ExecutionListPage />} />
        </Routes>
      </MemoryRouter>
    </Harness>,
  );
}
describe("execution inspection lifetime", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });
  it.each(["en", "ko"])(
    "shows the projected target and source URL in %s without provider fields",
    async (locale) => {
      await i18next.changeLanguage(locale);
      const detail: ExecutionRunPresentation = {
        ...run("first"),
        executionTarget: { name: "Daily close", location: "jobs/daily-close" },
        sourceUrl: "https://example.test/runs/first",
      };
      mount(inspectionTestClient({ getExecutionRun: async () => detail }));

      expect(
        await screen.findByRole("heading", { name: "Daily close" }),
      ).toBeInTheDocument();
      expect(screen.getByText("jobs/daily-close")).toBeInTheDocument();
      expect(
        screen.getByRole("link", {
          name: i18next.t("executionRequests:runDetail.actions.openGitHubRun"),
        }),
      ).toHaveAttribute("href", detail.sourceUrl);
    },
  );

  it("keeps the missing target fallback and hides an absent source link", async () => {
    const detail = run("first");
    delete detail.executionTarget;
    mount(inspectionTestClient({ getExecutionRun: async () => detail }));

    expect(
      await screen.findByRole("heading", {
        name: "Execution target unavailable",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Open source execution" }),
    ).not.toBeInTheDocument();
  });

  it("ignores late route reads and passes the exact explicit attempt", async () => {
    const first = deferred<ExecutionRunPresentation | null>(),
      second = deferred<ExecutionRunPresentation | null>();
    const get = vi.fn(({ runId }: { runId: string }) =>
      runId === "first" ? first.promise : second.promise,
    );
    mount(inspectionTestClient({ getExecutionRun: get }));
    fireEvent.click(screen.getByText("Next run"));
    await act(async () => second.resolve(run("second")));
    expect(screen.getByText("Business second")).toBeInTheDocument();
    await act(async () => first.resolve(run("first")));
    expect(screen.queryByText("Business first")).not.toBeInTheDocument();
    expect(get).toHaveBeenLastCalledWith({ runId: "second", runAttempt: 2 });
  });
  it("ignores an old client response and old job-log response", async () => {
    const log = deferred<ExecutionJobLog>();
    const first = inspectionTestClient({
      getExecutionRun: async () => run("first"),
      getExecutionRunJobLog: () => log.promise,
    });
    const second = inspectionTestClient({
      getExecutionRun: async () => run("replacement"),
    });
    mount(first, second);
    fireEvent.click(
      await screen.findByRole("button", { name: "View business logs" }),
    );
    fireEvent.click(screen.getByText("Switch client"));
    expect(await screen.findByText("Business replacement")).toBeInTheDocument();
    await act(async () =>
      log.resolve({
        jobId: "job.first",
        content: "Old log",
        businessSection: { content: "Old log", focused: true },
        sizeBytes: 7,
        truncated: false,
      }),
    );
    expect(screen.queryByText("Old log")).not.toBeInTheDocument();
  });
  it("keeps the form, log search and reads stable through a language change", async () => {
    const get = vi.fn(async () => run("first"));
    const log = vi.fn(async () => ({
      jobId: "job.first",
      content: "Gate prelude\nactual business",
      businessSection: { content: "actual business", focused: true },
      sizeBytes: 29,
      truncated: false,
    }));
    mount(
      inspectionTestClient({
        getExecutionRun: get,
        getExecutionRunJobLog: log,
      }),
    );
    fireEvent.change(await screen.findByLabelText("Owner"), {
      target: { value: "replacement-owner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "View business logs" }));
    await screen.findByText("actual business");
    fireEvent.change(screen.getByLabelText("Search log"), {
      target: { value: "business" },
    });
    await act(() => i18next.changeLanguage("ko"));
    expect(screen.getByDisplayValue("replacement-owner")).toBeInTheDocument();
    expect(screen.getByDisplayValue("business")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
  });
  it("retains the authoritative write when an older refresh resolves or a later refresh fails", async () => {
    const stale = deferred<ExecutionRunPresentation | null>();
    const get = vi
      .fn()
      .mockResolvedValueOnce(run("first"))
      .mockReturnValueOnce(stale.promise)
      .mockRejectedValueOnce(new Error("Refresh unavailable"));
    const write = deferred<FailureFollowUp>();
    const create = vi.fn(() => write.promise);
    mount(
      inspectionTestClient({
        getExecutionRun: get,
        createFailureFollowUp: create,
      }),
    );
    fireEvent.change(await screen.findByLabelText("Owner"), {
      target: { value: "owner" },
    });
    fireEvent.change(screen.getByLabelText("Explanation"), {
      target: { value: "Explanation" },
    });
    fireEvent.change(screen.getByLabelText("Action taken"), {
      target: { value: "Action" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record follow-up" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await act(async () => write.resolve(followUp("first")));
    expect(
      await screen.findByText("Authoritative saved explanation"),
    ).toBeInTheDocument();
    await act(async () => stale.resolve(run("first")));
    expect(
      screen.getByText("Authoritative saved explanation"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Refresh unavailable",
    );
    expect(
      screen.getByText("Authoritative saved explanation"),
    ).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("does not append a late follow-up to another run", async () => {
    const write = deferred<FailureFollowUp>();
    mount(
      inspectionTestClient({
        getExecutionRun: async ({ runId }) => run(runId),
        createFailureFollowUp: () => write.promise,
      }),
    );
    fireEvent.change(await screen.findByLabelText("Owner"), {
      target: { value: "owner" },
    });
    fireEvent.change(screen.getByLabelText("Explanation"), {
      target: { value: "Explanation" },
    });
    fireEvent.change(screen.getByLabelText("Action taken"), {
      target: { value: "Action" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record follow-up" }));
    fireEvent.click(screen.getByText("Next run"));
    await screen.findByText("Business second");
    await act(async () => write.resolve(followUp("first")));
    expect(
      screen.queryByText("Authoritative saved explanation"),
    ).not.toBeInTheDocument();
  });
  it("performs a real list refresh but not a language-triggered list reload", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce([run("one")])
      .mockResolvedValueOnce([run("two")]);
    render(
      <BatchPlaneClientContext.Provider
        value={inspectionTestClient({ listExecutionRuns: list })}
      >
        <MemoryRouter>
          <ExecutionListPage />
        </MemoryRouter>
      </BatchPlaneClientContext.Provider>,
    );
    await screen.findByText("batch.one");
    await act(() => i18next.changeLanguage("ko"));
    expect(list).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("batch.two")).toBeInTheDocument();
  });
});
