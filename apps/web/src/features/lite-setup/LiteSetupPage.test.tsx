import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import "../../i18n/i18n";
import { writeRuntimeFixtureSelection } from "../../runtime/runtime-fixtures";
import { LiteSetupPage } from "./LiteSetupPage";
import { githubSessionStorageKey } from "./github-session";

describe("LiteSetupPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("saves the GitHub token for the current browser session only", () => {
    render(<LiteSetupPage />);

    fireEvent.change(screen.getByLabelText("GitHub repository owner"), {
      target: { value: "always0ne" },
    });
    fireEvent.change(screen.getByLabelText("GitHub repository name"), {
      target: { value: "batch" },
    });
    fireEvent.change(screen.getByLabelText("GitHub token"), {
      target: { value: "github_pat_testtoken" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      JSON.parse(sessionStorage.getItem(githubSessionStorageKey) ?? "{}"),
    ).toEqual({
      owner: "always0ne",
      repo: "batch",
      token: "github_pat_testtoken",
    });
    expect(localStorage.getItem(githubSessionStorageKey)).toBeNull();
    expect(
      screen.getByText("Saved for this browser session"),
    ).toBeInTheDocument();
  });

  it("clears the stored GitHub token", () => {
    sessionStorage.setItem(
      githubSessionStorageKey,
      JSON.stringify({
        owner: "always0ne",
        repo: "batch",
        token: "github_pat_testtoken",
      }),
    );

    render(<LiteSetupPage />);

    fireEvent.click(screen.getByRole("button", { name: "Clear session" }));

    expect(sessionStorage.getItem(githubSessionStorageKey)).toBeNull();
    expect(screen.getByLabelText("GitHub token")).toHaveValue("");
  });

  it("creates a Workspace policy PR for self-approval mode", async () => {
    writeRuntimeFixtureSelection("happy-path");

    render(<LiteSetupPage />);

    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));

    expect(
      await screen.findByText("Self-approval blocked"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Approval mode"), {
      target: { value: "SELF_APPROVAL_ALLOWED" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create policy PR" }));

    expect(
      await screen.findByText("Workspace policy pull request created."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /^#\d+ Update BatchPlane Workspace policy$/,
      }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(
        /^https:\/\/github\.com\/always0ne\/batch\/pull\/\d+$/,
      ),
    );
  });

  it("creates a Workspace policy PR for auto-approval mode", async () => {
    writeRuntimeFixtureSelection("happy-path");

    render(<LiteSetupPage />);

    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));

    expect(
      await screen.findByText("Self-approval blocked"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Approval mode"), {
      target: { value: "AUTO_APPROVE" },
    });
    expect(
      await screen.findByText(
        "After this policy PR is merged, execution requests are approved automatically by Workspace policy. This mode also includes self-approval permission. The UI records explicit approval evidence; the dispatcher still performs workflow_dispatch.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create policy PR" }));

    expect(
      await screen.findByText("Workspace policy pull request created."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /^#\d+ Update BatchPlane Workspace policy$/,
      }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(
        /^https:\/\/github\.com\/always0ne\/batch\/pull\/\d+$/,
      ),
    );
  });

  it("creates a Workspace workflow update PR when installed workflows are outdated", async () => {
    writeRuntimeFixtureSelection("happy-path");

    render(<LiteSetupPage />);

    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));

    expect(
      await screen.findByText(
        "Workspace workflow files do not match the current BatchPlane template.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Create workflow update PR" }),
    );

    expect(
      await screen.findByText("Pull request created."),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Workflow update pull request is ready for maintainer review.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /^#\d+ Update BatchPlane Workspace workflows$/,
      }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(
        /^https:\/\/github\.com\/always0ne\/batch\/pull\/\d+$/,
      ),
    );
  });
});
