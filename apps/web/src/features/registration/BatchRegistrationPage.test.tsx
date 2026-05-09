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
    fireEvent.change(screen.getByLabelText("Workflow path"), {
      target: { value: ".github/workflows/daily-close.yml" },
    });

    expect(
      await screen.findByText(/payment.daily-close.yml/),
    ).toBeInTheDocument();
    expect(screen.getByText(/id: "payment.daily-close"/)).toBeInTheDocument();
    expect(
      screen.getByText(/path: ".github\/workflows\/daily-close.yml"/),
    ).toBeInTheDocument();
  });
});
