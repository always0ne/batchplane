import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import "../../i18n/i18n";
import { BatchRegistrationPage } from "./BatchRegistrationPage";

describe("BatchRegistrationPage", () => {
  it("renders a YAML preview from form input", async () => {
    render(<BatchRegistrationPage />);

    fireEvent.change(screen.getByLabelText("Batch ID"), {
      target: { value: "payment.daily-close" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Daily Close" },
    });
    fireEvent.change(screen.getByLabelText("Owner"), {
      target: { value: "ops-team" },
    });
    fireEvent.change(screen.getByLabelText("Domain"), {
      target: { value: "payments" },
    });
    expect(screen.queryByText(/new-batch/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Batch command"), {
      target: { value: "./scripts/daily-close.sh" },
    });

    expect(
      await screen.findAllByText(/payment.daily-close.yml/),
    ).not.toHaveLength(0);
    expect(screen.getByText(/id: "payment.daily-close"/)).toBeInTheDocument();
    expect(
      screen.getByText(/path: ".github\/workflows\/payment.daily-close.yml"/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("BatchTrail Gate always runs before the batch command."),
    ).toBeInTheDocument();

    expect(screen.getByText(/workflow_dispatch:/)).toBeInTheDocument();
    expect(screen.getByText(/batchtrail-gate:/)).toBeInTheDocument();
    expect(screen.getByText(/runs-on: "ubuntu-latest"/)).toBeInTheDocument();
    expect(screen.getAllByText(/.\/scripts\/daily-close.sh/)).not.toHaveLength(
      0,
    );
  });
});
