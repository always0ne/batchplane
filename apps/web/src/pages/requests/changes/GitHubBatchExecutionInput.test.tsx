import type { GitHubActionsExecutionSettings } from "@batchplane/ui-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "../../../i18n/i18n";
import { GitHubBatchExecutionInput } from "./GitHubBatchExecutionInput";

const execution: GitHubActionsExecutionSettings = {
  command: "./scripts/close.sh",
  existingFile: { fileName: "close.sh", locator: "scripts/close.sh" },
  platform: "GITHUB_ACTIONS",
  ref: "release/close",
  runnerLabel: "self-hosted, linux, payments",
};

describe("GitHubBatchExecutionInput", () => {
  it("uses controlled settings and preserves other execution fields when a custom runner changes", () => {
    const onChange = vi.fn();
    const onFileChange = vi.fn(async () => undefined);
    const { rerender } = render(
      <GitHubBatchExecutionInput
        value={execution}
        onChange={onChange}
        onFileChange={onFileChange}
      />,
    );

    expect(screen.getByText("scripts/close.sh")).toBeInTheDocument();
    const runner = screen.getByLabelText("Custom runner label");
    fireEvent.change(runner, { target: { value: "self-hosted, release" } });
    const next = { ...execution, runnerLabel: "self-hosted, release" };
    expect(onChange).toHaveBeenCalledWith(next);
    expect(runner).toHaveValue(execution.runnerLabel);

    rerender(
      <GitHubBatchExecutionInput
        value={next}
        onChange={onChange}
        onFileChange={onFileChange}
      />,
    );
    expect(runner).toHaveValue("self-hosted, release");
    expect(screen.getByLabelText("Workflow ref")).toHaveValue("release/close");
    expect(screen.getByLabelText("Batch command")).toHaveValue(
      execution.command,
    );
  });

  it("forwards the selected file without inventing execution settings", () => {
    const onChange = vi.fn();
    const onFileChange = vi.fn(async () => undefined);
    render(
      <GitHubBatchExecutionInput
        value={execution}
        onChange={onChange}
        onFileChange={onFileChange}
      />,
    );
    const file = new File(["replacement"], "replacement.jar");

    fireEvent.change(
      screen.getByLabelText("Execution file", { exact: false }),
      { target: { files: [file] } },
    );

    expect(onFileChange).toHaveBeenCalledWith(file);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Batch command")).toHaveValue(
      execution.command,
    );
  });
});
