import { render, screen } from "@testing-library/react";
import type { BatchListItem } from "@batchplane/ui-client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import "../../i18n/i18n";
import { BatchListContent } from "./BatchListContent";

describe("BatchListContent control rendering", () => {
  it("shows bypassed control and blocks the list-level manual execution action", () => {
    render(
      <MemoryRouter>
        <BatchListContent
          state={{
            batches: [bypassedBatch],
            sourceRevision: "main",
            type: "loaded",
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Revision bypassed")).toHaveAttribute(
      "title",
      expect.stringContaining("not been approved"),
    );
    expect(screen.getByRole("button", { name: "Request run" })).toBeDisabled();
    expect(screen.getByText("Unavailable")).toHaveAttribute(
      "title",
      expect.stringContaining("not been approved"),
    );
  });

  it("blocks unknown control with the adapter-projected reason", () => {
    render(
      <MemoryRouter>
        <BatchListContent
          state={{
            batches: [
              {
                ...bypassedBatch,
                control: {
                  disabledReason: "APPROVED_BATCH_REVISION_UNAVAILABLE",
                  remediation: { availableKinds: [], canRequest: false },
                  status: "UNKNOWN",
                },
              },
            ],
            sourceRevision: "main",
            type: "loaded",
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Revision unavailable")).toHaveAttribute(
      "title",
      "Manual execution is blocked because approved batch revision evidence is unavailable. Refresh the page and verify the Workspace connection and permissions.",
    );
    expect(screen.getByRole("button", { name: "Request run" })).toBeDisabled();
  });
});

const bypassedBatch: BatchListItem = {
  batchId: "payment.daily-close",
  control: {
    disabledReason: "UNAPPROVED_BATCH_REVISION",
    remediation: { availableKinds: ["REVIEW_CURRENT"], canRequest: true },
    status: "BYPASSED",
  },
  criticality: "HIGH",
  environment: "PROD",
  gateRequired: true,
  hasExecutableCommand: true,
  name: "Daily Close",
  owner: "ops-team",
  status: "ACTIVE",
};
