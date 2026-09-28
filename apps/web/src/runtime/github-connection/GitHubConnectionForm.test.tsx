import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "../../i18n/i18n";
import { LiteGitHubConnectionEditor } from "../GitHubConnectionForm";
import { writeGitHubSession } from "../github-session";

describe("GitHub connection editor composition", () => {
  beforeEach(async () => {
    sessionStorage.clear();
    localStorage.clear();
    await i18next.changeLanguage("en");
  });
  afterEach(async () => {
    cleanup();
    await i18next.changeLanguage("en");
  });

  it("keeps the draft input and focus across checking and language changes", async () => {
    writeGitHubSession({
      owner: "original",
      repo: "batch",
      token: "test-token-for-session",
    });
    const onConnectionChanged = vi.fn();
    const onCheckConnection = vi.fn(async () => undefined);
    const view = render(
      <LiteGitHubConnectionEditor
        checking={false}
        onConnectionChanged={onConnectionChanged}
        onCheckConnection={onCheckConnection}
      />,
    );
    const owner = screen.getByLabelText("GitHub repository owner");
    fireEvent.change(owner, { target: { value: "edited-owner" } });
    owner.focus();
    expect(onConnectionChanged).toHaveBeenCalledTimes(1);

    view.rerender(
      <LiteGitHubConnectionEditor
        checking
        onConnectionChanged={onConnectionChanged}
        onCheckConnection={onCheckConnection}
      />,
    );
    expect(screen.getByLabelText("GitHub repository owner")).toBe(owner);
    expect(owner).toHaveValue("edited-owner");
    expect(owner).toHaveFocus();
    expect(screen.getByText("original/batch")).toBeInTheDocument();
    const check = screen.getByRole("button", { name: "Check connection" });
    expect(check).toBeDisabled();
    expect(check.parentElement).toHaveAttribute(
      "title",
      "Checking connection...",
    );

    await act(async () => {
      await i18next.changeLanguage("ko");
    });
    expect(screen.getByLabelText(i18next.t("settings:github.owner"))).toBe(
      owner,
    );
    expect(owner).toHaveValue("edited-owner");
    expect(owner).toHaveFocus();
    expect(onCheckConnection).not.toHaveBeenCalled();
  });

  it("prioritizes missing fields over checking and shows validation before session status", () => {
    const onConnectionChanged = vi.fn();
    const onCheckConnection = vi.fn(async () => undefined);
    const view = render(
      <LiteGitHubConnectionEditor
        checking
        onConnectionChanged={onConnectionChanged}
        onCheckConnection={onCheckConnection}
      />,
    );
    const check = screen.getByRole("button", { name: "Check connection" });
    expect(check).toBeDisabled();
    expect(check.parentElement).toHaveAttribute(
      "title",
      i18next.t("settings:errors.requiredFields"),
    );
    expect(screen.getByRole("button", { name: "Save session" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Clear session" }),
    ).toBeDisabled();

    fireEvent.submit(view.container.querySelector("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent(
      i18next.t("settings:errors.requiredFields"),
    );
    expect(screen.queryByText("Not connected")).not.toBeInTheDocument();
    expect(onConnectionChanged).toHaveBeenCalledTimes(1);
    expect(onCheckConnection).not.toHaveBeenCalled();
  });
});
