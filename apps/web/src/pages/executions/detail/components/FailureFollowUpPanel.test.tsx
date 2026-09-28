import type { ExecutionRunPresentation } from "@batchplane/ui-client";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "../../../../i18n/i18n";
import { deferred } from "../../../../test/inspection-client";
import { FailureFollowUpPanel } from "./FailureFollowUpPanel";

const run: ExecutionRunPresentation = {
  batchId: "batch-1",
  requestId: "request-1",
  runId: "run-1",
  status: "FAILED",
};

describe("FailureFollowUpPanel input lifetime", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });
  afterEach(async () => {
    cleanup();
    await i18next.changeLanguage("en");
  });

  it("keeps the same form through submission and language changes, then clears saved input", async () => {
    const pending = deferred<void>();
    const onSubmit = vi.fn(() => pending.promise);
    render(
      <FailureFollowUpPanel onReview={vi.fn()} onSubmit={onSubmit} run={run} />,
    );
    const owner = screen.getByLabelText("Owner");
    const explanation = screen.getByLabelText("Explanation");
    const actionTaken = screen.getByLabelText("Action taken");
    const status = screen.getByRole("combobox");
    fireEvent.change(owner, { target: { value: "  operations  " } });
    fireEvent.change(explanation, {
      target: { value: "  Reconciled evidence  " },
    });
    fireEvent.change(actionTaken, {
      target: { value: "  Reprocessed batch  " },
    });
    fireEvent.change(status, { target: { value: "RESOLVED" } });
    explanation.focus();
    fireEvent.click(screen.getByRole("button", { name: "Record follow-up" }));

    expect(onSubmit).toHaveBeenCalledWith({
      actionTaken: "Reprocessed batch",
      explanation: "Reconciled evidence",
      owner: "operations",
      status: "RESOLVED",
    });
    await act(async () => {
      await i18next.changeLanguage("ko");
    });
    expect(
      screen.getByLabelText(
        i18next.t("executionRequests:runDetail.followUp.owner"),
      ),
    ).toBe(owner);
    expect(
      screen.getByLabelText(
        i18next.t("executionRequests:runDetail.followUp.explanation"),
      ),
    ).toBe(explanation);
    expect(explanation).toHaveFocus();
    expect(explanation).toHaveValue("  Reconciled evidence  ");
    expect(status).toHaveValue("RESOLVED");
    expect(
      screen.getByRole("button", {
        name: i18next.t("executionRequests:runDetail.followUp.saving"),
      }),
    ).toBeDisabled();

    await act(async () => pending.resolve());
    expect(
      screen.getByLabelText(
        i18next.t("executionRequests:runDetail.followUp.explanation"),
      ),
    ).toBe(explanation);
    expect(explanation).toHaveFocus();
    expect(explanation).toHaveValue("");
    expect(owner).toHaveValue("");
    expect(actionTaken).toHaveValue("");
    expect(status).toHaveValue("INVESTIGATING");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
