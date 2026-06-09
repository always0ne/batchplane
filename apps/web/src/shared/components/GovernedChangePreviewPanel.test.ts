import { describe, expect, it } from "vitest";

import {
  hasNoGovernedFileChanges,
  type GovernedChangePreviewState,
} from "./governed-change-preview";

describe("GovernedChangePreviewPanel", () => {
  it("detects a ready preview with only unchanged files as a no-op", () => {
    const state: GovernedChangePreviewState = {
      files: [
        {
          baseContent: "name: batch\n",
          nextContent: "name: batch\n",
          path: ".batch-governance/batches/example.yml",
          status: "UNCHANGED",
        },
        {
          baseContent: "jobs: {}\n",
          nextContent: "jobs: {}\n",
          path: ".github/workflows/example.yml",
          status: "UNCHANGED",
        },
      ],
      type: "ready",
    };

    expect(hasNoGovernedFileChanges(state)).toBe(true);
  });

  it("does not treat changed, empty, or non-ready previews as no-ops", () => {
    const modifiedState: GovernedChangePreviewState = {
      files: [
        {
          baseContent: "name: batch\n",
          nextContent: "name: changed\n",
          path: ".batch-governance/batches/example.yml",
          status: "MODIFIED",
        },
      ],
      type: "ready",
    };
    const emptyState: GovernedChangePreviewState = { files: [], type: "ready" };

    expect(hasNoGovernedFileChanges(modifiedState)).toBe(false);
    expect(hasNoGovernedFileChanges(emptyState)).toBe(false);
    expect(hasNoGovernedFileChanges({ type: "loading" })).toBe(false);
  });
});
