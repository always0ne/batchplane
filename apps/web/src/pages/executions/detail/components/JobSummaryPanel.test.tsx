import type {
  ExecutionJobLog,
  ExecutionRunPresentation,
} from "@batchplane/ui-client";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "../../../../i18n/i18n";
import { JobSummaryPanel } from "./JobSummaryPanel";

const run: ExecutionRunPresentation = {
  batchId: "batch-1",
  requestId: "request-1",
  runId: "run-1",
  status: "FAILED",
  jobs: [
    {
      jobId: "job-1",
      name: "Business job",
      role: "BUSINESS",
      status: "FAILED",
    },
  ],
};
const log: ExecutionJobLog = {
  jobId: "job-1",
  content: "Gate prelude\nbusiness command",
  businessSection: { content: "business command", focused: true },
  sizeBytes: 29,
  truncated: false,
};

describe("JobSummaryPanel input lifetime", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });
  afterEach(async () => {
    cleanup();
    await i18next.changeLanguage("en");
  });

  it("keeps log search across locale and reopening while resetting the viewer mode on remount", async () => {
    const onLoadLog = vi.fn(async () => log);
    render(<JobSummaryPanel onLoadLog={onLoadLog} run={run} />);
    fireEvent.click(screen.getByRole("button", { name: "View business logs" }));
    const search = await screen.findByLabelText("Search log");
    fireEvent.click(
      screen.getByRole("button", {
        name: i18next.t("executionRequests:runDetail.jobs.fullLogView"),
      }),
    );
    expect(
      screen.getByText(/Gate prelude/, { selector: "pre" }),
    ).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "command" } });
    search.focus();

    await act(async () => {
      await i18next.changeLanguage("ko");
    });
    expect(
      screen.getByLabelText(
        i18next.t("executionRequests:runDetail.jobs.searchLog"),
      ),
    ).toBe(search);
    expect(search).toHaveValue("command");
    expect(search).toHaveFocus();
    expect(onLoadLog).toHaveBeenCalledTimes(1);
    expect(onLoadLog).toHaveBeenCalledWith("job-1");

    fireEvent.click(
      screen.getByRole("button", {
        name: i18next.t("executionRequests:runDetail.jobs.hideLog"),
      }),
    );
    expect(
      screen.queryByLabelText(
        i18next.t("executionRequests:runDetail.jobs.searchLog"),
      ),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: i18next.t("executionRequests:runDetail.jobs.viewBusinessLog"),
      }),
    );
    const reopened = await screen.findByLabelText(
      i18next.t("executionRequests:runDetail.jobs.searchLog"),
    );
    expect(reopened).toHaveValue("command");
    fireEvent.change(reopened, { target: { value: "" } });
    expect(
      screen.getByText("business command", { selector: "pre" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Gate prelude/, { selector: "pre" }),
    ).not.toBeInTheDocument();
    expect(onLoadLog).toHaveBeenCalledTimes(2);
  });
});
