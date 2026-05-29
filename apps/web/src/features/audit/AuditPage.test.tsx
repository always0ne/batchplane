import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import {
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
} from "@batchplane/github-lite";

import { createGitHubLiteRuntime } from "../../runtime/github-lite-runtime";
import "../../i18n/i18n";
import { AuditPage } from "./AuditPage";

const session = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

describe("AuditPage", () => {
  it("renders audit timeline items with source links and filters", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());

    render(
      <MemoryRouter>
        <AuditPage
          createRuntime={() => createGitHubLiteRuntime(session, { client })}
          readSession={() => session}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Audit Trail" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Timeline filters")).toBeInTheDocument();
    expect(screen.getAllByText("Execution requested").length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(/Gate blocked for/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText("GitHub source").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Batch"), {
      target: { value: "payment.daily-close" },
    });

    expect(screen.getByDisplayValue("payment.daily-close")).toBeInTheDocument();
    expect(screen.getAllByText(/payment.daily-close/u).length).toBeGreaterThan(
      0,
    );
  });

  it("renders an empty state when no runtime session is available", async () => {
    render(
      <MemoryRouter>
        <AuditPage readSession={() => null} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        "Connect a GitHub repository to inspect the audit trail.",
      ),
    ).toBeInTheDocument();
  });
});
