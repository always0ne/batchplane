import { fireEvent, render, screen } from "@testing-library/react";
import type { FailureFollowUp } from "@batchplane/ui-client";
import { describe, expect, it, vi } from "vitest";

import "../../../i18n/i18n";
import { FailureFollowUpItem } from "./FailureFollowUpItem";

const followUp: FailureFollowUp = {
  actionTaken: "Reprocessed the batch.",
  author: "developer",
  batchId: "payment.daily-close",
  createdAt: "2026-09-11T00:00:00.000Z",
  explanation: "The ledger arrived late.",
  followUpId: "follow-up-1",
  owner: "ops-team",
  requestId: "request-1",
  reviewCapability: { canReview: true },
  reviews: [],
  reviewStatus: "AWAITING_REVIEW",
  runId: "run-1",
  status: "OPEN",
};

describe("FailureFollowUpItem", () => {
  it("retains the review reason while review permission temporarily hides the form", () => {
    const onReview = vi.fn();
    const { rerender } = render(
      <FailureFollowUpItem followUp={followUp} onReview={onReview} />,
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Evidence is sufficient." },
    });

    rerender(
      <FailureFollowUpItem
        followUp={{
          ...followUp,
          reviewCapability: {
            canReview: false,
            unavailableReason: "NOT_WORKSPACE_MANAGER",
          },
        }}
        onReview={onReview}
      />,
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    rerender(<FailureFollowUpItem followUp={followUp} onReview={onReview} />);
    expect(screen.getByRole("textbox")).toHaveValue("Evidence is sufficient.");
  });
});
