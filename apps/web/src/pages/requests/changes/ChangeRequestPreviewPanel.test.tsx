import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChangeRequestPreviewPanel } from "./ChangeRequestPreviewPanel";

describe("ChangeRequestPreviewPanel", () => {
  it("shows a text diff, binary digests, and no untrusted content for unavailable evidence", () => {
    render(
      <ChangeRequestPreviewPanel
        files={[
          {
            baseContent: "before\n",
            nextContent: "after\n",
            path: "batch.yml",
            status: "MODIFIED",
          },
          {
            afterDigest: "sha256:after",
            beforeDigest: "sha256:before",
            contentKind: "BINARY",
            path: "artifact.zip",
            status: "MODIFIED",
          },
          {
            evidenceUnavailable: true,
            nextContent: "not-authoritative",
            path: "unknown.yml",
            status: "MODIFIED",
          },
        ]}
        labels={{
          binarySummary: "Digest",
          emptyFile: "Empty",
          evidenceUnavailable: "Evidence unavailable",
          preview: "Preview",
          status: {
            ADDED: "Added",
            DELETED: "Deleted",
            MODIFIED: "Modified",
            UNCHANGED: "Unchanged",
          },
          subtitle: "Subtitle",
          title: "Title",
        }}
      />,
    );

    expect(screen.getByText("- before")).toBeInTheDocument();
    expect(screen.getByText("+ after")).toBeInTheDocument();
    expect(screen.getByText("sha256:before")).toBeInTheDocument();
    expect(screen.getByText("sha256:after")).toBeInTheDocument();
    expect(screen.getByText("Evidence unavailable")).toBeInTheDocument();
    expect(screen.queryByText("not-authoritative")).not.toBeInTheDocument();
  });
});
