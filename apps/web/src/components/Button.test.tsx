import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { Button, ButtonLink } from "./Button";

describe("Button", () => {
  it("defaults to a non-submitting native button", () => {
    const handleClick = vi.fn();
    const handleSubmit = vi.fn();

    render(
      <form onSubmit={handleSubmit}>
        <Button onClick={handleClick}>Refresh batches</Button>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Refresh batches" });
    fireEvent.click(button);

    expect(button).toHaveAttribute("type", "button");
    expect(handleClick).toHaveBeenCalledOnce();
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("preserves native disabled semantics", () => {
    const handleClick = vi.fn();

    render(
      <Button disabled onClick={handleClick}>
        Request run
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Request run" });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(handleClick).not.toHaveBeenCalled();
  });
});

describe("ButtonLink", () => {
  it("provides accessible internal navigation", () => {
    render(
      <MemoryRouter initialEntries={["/batches"]}>
        <Routes>
          <Route
            path="/batches"
            element={
              <ButtonLink to="/batches/new" variant="primary">
                Register batch
              </ButtonLink>
            }
          />
          <Route path="/batches/new" element={<p>Batch registration</p>} />
        </Routes>
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "Register batch" });

    expect(link).toHaveAttribute("href", "/batches/new");
    fireEvent.click(link);
    expect(screen.getByText("Batch registration")).toBeInTheDocument();
  });
});
