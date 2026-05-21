import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import "../../i18n/i18n";
import { LiteSetupPage } from "./LiteSetupPage";
import { githubSessionStorageKey } from "./github-session";

describe("LiteSetupPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("saves the GitHub token for the current browser session only", () => {
    render(<LiteSetupPage />);

    fireEvent.change(screen.getByLabelText("Repository owner"), {
      target: { value: "always0ne" },
    });
    fireEvent.change(screen.getByLabelText("Repository name"), {
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
});
