import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WorkspaceEncryptionSetupResult,
  WorkspaceEncryptionStatus,
} from "@batchplane/ui-client";
import { BatchPlaneClientContext } from "../../../../client/batch-plane-client-context";
import { i18next } from "../../../../i18n/i18n";
import workspaceEncryptionEn from "../../../../i18n/locales/en/workspaceEncryption.json";
import workspaceEncryptionKo from "../../../../i18n/locales/ko/workspaceEncryption.json";
import {
  deferred,
  inspectionTestClient,
} from "../../../../test/inspection-client";
import type { WorkspaceInspectionState } from "../../hooks/useWorkspaceInspection";
import { WorkspaceEncryption } from "./WorkspaceEncryption";

const loadedInspection: WorkspaceInspectionState = {
  type: "loaded",
  revision: 1,
  data: {
    connection: {
      label: "Workspace",
      currentUser: "maintainer",
      defaultRevision: "main",
    },
    installation: {
      installed: true,
      availableRequest: null,
      requiredEvidence: [],
      presentEvidence: [],
      missingEvidence: [],
      outdatedEvidence: [],
    },
    policy: { approval: { mode: "SELF_APPROVAL_BLOCKED" } },
  },
};
const notConfigured: WorkspaceEncryptionStatus = {
  state: "NOT_CONFIGURED",
  configurationPublished: false,
  privateKeyStored: "ABSENT",
  canInitialize: true,
  canRetryUpload: false,
};
const request = {
  label: "Encryption request 71",
  sourceUrl: "https://example.test/requests/71",
};
const incomplete: WorkspaceEncryptionStatus = {
  ...notConfigured,
  state: "INCOMPLETE",
  canInitialize: false,
  request,
};

beforeEach(async () => {
  i18next.addResourceBundle("en", "workspaceEncryption", workspaceEncryptionEn);
  i18next.addResourceBundle("ko", "workspaceEncryption", workspaceEncryptionKo);
  await i18next.changeLanguage("en");
});
afterEach(async () => {
  cleanup();
  await i18next.changeLanguage("en");
});

function mount(
  client: ReturnType<typeof inspectionTestClient>,
  inspection = loadedInspection,
) {
  function View({ state }: { state: WorkspaceInspectionState }) {
    return (
      <BatchPlaneClientContext.Provider value={client}>
        <WorkspaceEncryption inspection={state} />
      </BatchPlaneClientContext.Provider>
    );
  }
  const rendered = render(<View state={inspection} />);
  return {
    ...rendered,
    inspect(state: WorkspaceInspectionState) {
      rendered.rerender(<View state={state} />);
    },
  };
}

describe("Workspace encryption settings", () => {
  it("does not inspect or initialize keys before connection verification and ignores a late setup result after disconnect", async () => {
    const pending = deferred<WorkspaceEncryptionSetupResult>();
    const inspectWorkspaceEncryption = vi.fn(async () => notConfigured);
    const initializeWorkspaceEncryption = vi.fn(() => pending.promise);
    const view = mount(
      inspectionTestClient({
        inspectWorkspaceEncryption,
        initializeWorkspaceEncryption,
      }),
      { type: "idle", revision: 0 },
    );
    const initialize = screen.getByRole("button", {
      name: workspaceEncryptionEn.initialize,
    });
    expect(initialize).toBeDisabled();
    expect(inspectWorkspaceEncryption).not.toHaveBeenCalled();
    fireEvent.click(initialize);
    expect(initializeWorkspaceEncryption).not.toHaveBeenCalled();
    view.inspect(loadedInspection);
    await waitFor(() => expect(initialize).toBeEnabled());
    fireEvent.click(initialize);
    view.inspect({ type: "idle", revision: 2 });
    await act(async () => {
      pending.resolve({
        upload: "RECORDED",
        status: {
          ...incomplete,
          state: "PENDING_APPROVAL",
          privateKeyStored: "PRESENT",
        },
      });
      await pending.promise;
    });
    expect(
      screen.queryByRole("link", { name: request.label }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: workspaceEncryptionEn.initialize }),
    ).toBeDisabled();
    expect(initializeWorkspaceEncryption).toHaveBeenCalledTimes(1);
  });

  it.each(["en", "ko"] as const)(
    "keeps the existing request after an upload failure and offers same-session retry in %s",
    async (locale) => {
      await i18next.changeLanguage(locale);
      const copy =
        locale === "ko" ? workspaceEncryptionKo : workspaceEncryptionEn;
      const initializeWorkspaceEncryption = vi
        .fn()
        .mockResolvedValueOnce({
          upload: "FAILED",
          status: { ...incomplete, canRetryUpload: true },
          error: { type: "access-denied" },
        })
        .mockResolvedValueOnce({
          upload: "RECORDED",
          status: {
            ...incomplete,
            state: "PENDING_APPROVAL",
            privateKeyStored: "PRESENT",
          },
        });
      mount(
        inspectionTestClient({
          inspectWorkspaceEncryption: async () => notConfigured,
          initializeWorkspaceEncryption,
        }),
      );
      const initialize = screen.getByRole("button", { name: copy.initialize });
      await waitFor(() => expect(initialize).toBeEnabled());
      fireEvent.click(initialize);
      expect(
        await screen.findByRole("link", { name: request.label }),
      ).toHaveAttribute("href", request.sourceUrl);
      expect(screen.getByRole("alert")).toHaveTextContent(copy.uploadFailed);
      const retry = screen.getByRole("button", { name: copy.retry });
      expect(retry).toBeEnabled();
      fireEvent.click(retry);
      expect(await screen.findByText(copy.maskedSaved)).toBeInTheDocument();
      expect(screen.getByText(copy.setupEvidenceOnly)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: request.label }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: copy.initialize }),
      ).toBeDisabled();
      expect(initializeWorkspaceEncryption).toHaveBeenCalledTimes(2);
      expect(
        screen.queryByRole("button", { name: /reveal|show key|원문|키 보기/i }),
      ).not.toBeInTheDocument();
    },
  );

  it.each(["en", "ko"] as const)(
    "requires explicit administrator resolution for an incomplete reconnect and never offers regeneration in %s",
    async (locale) => {
      await i18next.changeLanguage(locale);
      const copy =
        locale === "ko" ? workspaceEncryptionKo : workspaceEncryptionEn;
      const initializeWorkspaceEncryption = vi.fn();
      mount(
        inspectionTestClient({
          inspectWorkspaceEncryption: async () => incomplete,
          initializeWorkspaceEncryption,
        }),
      );
      expect(await screen.findByText(copy.adminResolution)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: request.label }),
      ).toBeInTheDocument();
      const initialize = screen.getByRole("button", { name: copy.initialize });
      expect(initialize).toBeDisabled();
      fireEvent.click(initialize);
      expect(initializeWorkspaceEncryption).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: copy.retry }),
      ).not.toBeInTheDocument();
    },
  );
});
