import type {
  BatchParameterDefinition,
  ParameterSelection,
} from "@batchplane/domain";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import type { WorkspaceEncryptionUnavailableReason } from "@batchplane/ui-client";
import { i18next } from "../../../../i18n/i18n";
import { ParameterSelections } from "./ParameterSelections";
import { ParameterValueInput } from "./ParameterValueInput";
import { initialParameterSelection } from "../parameter-selections";

describe("ParameterSelections", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("uses only defined names and flags, distinguishes default, empty supplied value and omission, and retains multiline input across locales", async () => {
    const definitions: BatchParameterDefinition[] = [
      { name: "Report", required: true, sensitive: false },
      {
        name: "Region",
        required: false,
        sensitive: false,
        defaultValue: { kind: "VALUE", value: "east" },
      },
    ];
    render(
      <MemoryRouter>
        <SelectionEditor definitions={definitions} available />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("button", { name: "Add parameter" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const reportSource = screen.getByLabelText("Source for Report");
    expect(
      within(reportSource).queryByRole("option", { name: "Omit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Select a supplied value for Report; no default is available.",
      ),
    ).toBeInTheDocument();
    fireEvent.change(reportSource, { target: { value: "VALUE" } });
    expect(screen.getByLabelText("Value for Report")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Source for Region"), {
      target: { value: "VALUE" },
    });
    expect(screen.getByTestId("selection").textContent).toContain(
      '"value":{"kind":"VALUE","value":""}',
    );
    fireEvent.change(screen.getByLabelText("Source for Region"), {
      target: { value: "OMIT" },
    });
    const exact = " 001\n한글\n ";
    fireEvent.change(screen.getByLabelText("Value for Report"), {
      target: { value: exact },
    });
    await act(async () => {
      await i18next.changeLanguage("ko");
    });
    expect(screen.getByLabelText("Report 값")).toHaveValue(exact);
    expect(JSON.parse(screen.getByTestId("selection").textContent!)).toEqual([
      {
        name: "Report",
        source: "VALUE",
        value: { kind: "VALUE", value: exact },
      },
      { name: "Region", source: "OMIT" },
    ]);
  });

  it("preserves a protected default while setup is unavailable, never shows its reference and disables sensitive replacement", () => {
    render(
      <MemoryRouter>
        <SelectionEditor
          definitions={[
            {
              name: "Token",
              required: true,
              sensitive: true,
              defaultValue: {
                kind: "SAVED",
                reference: "opaque-reference-not-displayable",
              },
            },
          ]}
          available={false}
          unavailableReason="STATUS_UNAVAILABLE"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Protected value")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Workspace sensitive input readiness could not be verified. Check access and try again.",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Source for Token")).getByRole("option", {
        name: "Specify a value",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "Open Workspace" }),
    ).toHaveAttribute("href", "/workspace");
    expect(
      screen.queryByRole("button", { name: /Show/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/opaque-reference-not-displayable/),
    ).not.toBeInTheDocument();
    render(
      <MemoryRouter>
        <ParameterValueInput
          label="Protected default"
          onChange={() => undefined}
          sensitive
          sensitiveInputsAvailable={false}
          value={{
            kind: "SAVED",
            reference: "opaque-reference-not-displayable",
          }}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Replace protected value" }),
    ).toBeDisabled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("masks only the current multiline draft, reveals it on author choice, and remasks after switching away", async () => {
    render(
      <MemoryRouter>
        <SelectionEditor
          definitions={[
            {
              name: "Token",
              required: true,
              sensitive: true,
              defaultValue: { kind: "SAVED", reference: "opaque" },
            },
          ]}
          available
        />
      </MemoryRouter>,
    );
    const caution = "Saved sensitive values cannot be revealed again.";
    expect(screen.queryByText(caution)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Source for Token"), {
      target: { value: "VALUE" },
    });
    const input = screen.getByLabelText("Value for Token");
    expect(screen.getByText(caution)).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription(caution);
    const exact = "first\n second\n";
    fireEvent.change(input, { target: { value: exact } });
    expect(input.tagName).toBe("TEXTAREA");
    expect(
      (input as HTMLTextAreaElement).style.getPropertyValue(
        "-webkit-text-security",
      ),
    ).toBe("disc");
    fireEvent.click(screen.getByRole("button", { name: "Show entered value" }));
    expect(input).toHaveValue(exact);
    expect(
      screen.getByRole("button", { name: "Hide entered value" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Source for Token"), {
      target: { value: "DEFAULT" },
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(caution)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Source for Token"), {
      target: { value: "VALUE" },
    });
    expect(
      screen.getByRole("button", { name: "Show entered value" }),
    ).toHaveAttribute("aria-pressed", "false");
    await act(async () => {
      await i18next.changeLanguage("ko");
    });
    expect(
      screen.getByText("저장한 민감 값의 원문은 다시 열람할 수 없습니다."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Token 값")).toHaveAccessibleDescription(
      "저장한 민감 값의 원문은 다시 열람할 수 없습니다.",
    );
  });
});

function SelectionEditor({
  definitions,
  available,
  unavailableReason,
}: {
  definitions: BatchParameterDefinition[];
  available: boolean;
  unavailableReason?: WorkspaceEncryptionUnavailableReason;
}) {
  const [selections, setSelections] = useState<ParameterSelection[]>(() =>
    definitions.map(initialParameterSelection),
  );
  return (
    <>
      <ParameterSelections
        definitions={definitions}
        onChange={setSelections}
        selections={selections}
        sensitiveInputsAvailable={available}
        sensitiveInputsUnavailableReason={unavailableReason}
      />
      <output data-testid="selection">{JSON.stringify(selections)}</output>
    </>
  );
}
