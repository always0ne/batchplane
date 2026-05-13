import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import "../i18n/i18n";

describe("App", () => {
  it.each([
    { heading: "Dashboard", path: "/dashboard" },
    { heading: "Settings", path: "/lite/setup" },
    { heading: "Batches", path: "/batches" },
    { heading: "Registration", path: "/batches/new" },
    { heading: "Approvals", path: "/approvals" },
  ])("renders the $path route", async ({ heading, path }) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: heading }),
    ).toBeInTheDocument();
    expect(screen.getByText("BatchTrail")).toBeInTheDocument();
  });

  it("redirects the root route to the dashboard", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
  });

  it("renders a not found state for unknown routes", async () => {
    render(
      <MemoryRouter initialEntries={["/unknown"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });
});
