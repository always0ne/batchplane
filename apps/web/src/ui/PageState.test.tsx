import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState, ErrorState, LoadingState, PageState } from "./PageState";

describe("PageState", () => {
  it("renders neutral content with an optional action", () => {
    render(
      <PageState
        action={<button type="button">Retry</button>}
        message="No rows are available."
        title="Nothing here"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Nothing here");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders loading and empty variants as polite statuses", () => {
    render(
      <>
        <LoadingState message="Loading batches..." />
        <EmptyState message="No batches yet." />
      </>,
    );

    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getByText("Loading batches...")).toBeInTheDocument();
    expect(screen.getByText("No batches yet.")).toBeInTheDocument();
  });

  it("renders errors as alerts", () => {
    render(<ErrorState message="GitHub rejected the request." />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "GitHub rejected the request.",
    );
  });
});
