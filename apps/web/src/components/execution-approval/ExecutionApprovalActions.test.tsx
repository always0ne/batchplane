import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "../../i18n/i18n";
import { ExecutionApprovalActions } from "./ExecutionApprovalActions";

describe("ExecutionApprovalActions", () => {
  it("keeps an available rejection independent from a disabled approval", () => {
    const onReject = vi.fn();
    render(
      <ExecutionApprovalActions
        approveDisabled
        approveLabel="Approve execution"
        disabled={false}
        isApproving={false}
        isRejecting={false}
        onApprove={vi.fn()}
        onReject={onReject}
        rejectLabel="Reject"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Approve execution" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "The requested time has expired." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));

    expect(onReject).toHaveBeenCalledWith("The requested time has expired.");
  });

  it("keeps an available approval independent from a disabled rejection", () => {
    const onApprove = vi.fn();
    render(
      <ExecutionApprovalActions
        approveLabel="Approve execution"
        disabled={false}
        isApproving={false}
        isRejecting={false}
        onApprove={onApprove}
        onReject={vi.fn()}
        rejectDisabled
        rejectLabel="Reject"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve execution" }));

    expect(onApprove).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });
});
