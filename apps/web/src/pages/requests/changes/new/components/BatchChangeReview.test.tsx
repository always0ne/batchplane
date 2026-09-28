import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../../../../i18n/i18n";
import { BatchChangeReview } from "./BatchChangeReview";

describe("BatchChangeReview", () => {
  it("keeps required-field guidance independent of preview errors and preserves disabled-reason priority", () => {
    const page = render(
      <BatchChangeReview
        missingFields={["execution.command"]}
        mode="change"
        previewState={{ message: "Preview failed", type: "error" }}
        showSubmissionProgress={false}
      />,
    );
    const submit = screen.getByRole("button", {
      name: "Create change request",
    });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute(
      "title",
      "Required fields are missing: Batch command",
    );
    expect(submit).toHaveAccessibleDescription(
      "Required fields are missing: Batch command",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Preview failed");

    page.rerender(
      <BatchChangeReview
        missingFields={[]}
        mode="change"
        previewState={{ message: "Preview failed", type: "error" }}
        showSubmissionProgress={false}
      />,
    );
    expect(submit).toHaveAttribute(
      "title",
      "controlled diff preview is not ready yet.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Preview failed");

    page.rerender(
      <BatchChangeReview
        missingFields={[]}
        mode="change"
        previewState={{
          preview: {
            files: [],
            hasEffectiveChanges: true,
            targetRevisionDigest: "sha256:preview",
          },
          type: "ready",
        }}
        showSubmissionProgress
      />,
    );
    expect(screen.getByRole("button", { name: "Create change request" })).toBe(
      submit,
    );
    expect(submit).toBeDisabled();
    expect(submit).not.toHaveAttribute("title");
    expect(submit).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
