import { AlertCircle, FilePlus2, Loader2, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { useWorkspaceInstallation } from "./useWorkspaceInstallation";
import type { WorkspaceInspectionState } from "./useWorkspaceInspection";
import { formatWorkspaceError } from "./workspace-errors";

export function WorkspaceInstallation({
  inspection,
  prepareRequest,
}: {
  inspection: WorkspaceInspectionState;
  prepareRequest: () => void;
}) {
  const { t } = useTranslation("settings");
  const request = useWorkspaceInstallation(inspection.revision, prepareRequest);
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-bp-graphite">
            {t("installation.title")}
          </h2>
          <p className="mt-2 text-sm text-bp-muted">
            {t("installation.subtitle")}
          </p>
        </div>
        <ShieldCheck
          className="h-5 w-5 shrink-0 text-bp-git"
          aria-hidden="true"
        />
      </div>
      <InstallationStatus inspection={inspection} request={request} />
    </article>
  );
}

function InstallationStatus({
  inspection,
  request,
}: {
  inspection: WorkspaceInspectionState;
  request: ReturnType<typeof useWorkspaceInstallation>;
}) {
  const { t } = useTranslation("settings");
  const state = request.state;
  if (state.type === "success")
    return (
      <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <p className="font-semibold">{t("installation.success")}</p>
        <p className="mt-1 font-semibold">
          {t(
            state.variant === "update"
              ? "installation.updateSuccess"
              : "installation.installSuccess",
          )}
        </p>
        <a
          className="mt-2 inline-flex break-words font-semibold underline"
          href={state.result.request.sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          {state.result.request.label}
        </a>
      </div>
    );
  if (state.type === "creating" || inspection.type === "checking")
    return (
      <p className="mt-5 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        {t(
          state.type === "creating"
            ? "installation.creating"
            : "installation.checking",
        )}
      </p>
    );
  if (state.type === "error" || inspection.type === "error") {
    const error =
      state.type === "error"
        ? state.error
        : inspection.type === "error"
          ? inspection.error
          : undefined;
    return (
      <div
        role="alert"
        className="mt-5 flex gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
      >
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 break-words font-semibold">
          {formatWorkspaceError(error, t)}
        </p>
      </div>
    );
  }
  if (inspection.type !== "loaded")
    return (
      <p className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
        {t("installation.idle")}
      </p>
    );

  const installation = inspection.data.installation;
  const variant =
    installation.availableRequest === "UPDATE" ? "update" : "install";
  const evidence = installation.installed
    ? installation.outdatedEvidence
    : installation.missingEvidence;
  if (installation.installed && installation.availableRequest === null)
    return (
      <p className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
        {t("installation.installed")}
      </p>
    );
  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <p className="font-semibold">
          {t(
            installation.installed
              ? "installation.outdated"
              : "installation.missing",
          )}
        </p>
        <ul className="mt-2 space-y-1 font-mono text-xs">
          {evidence.map((label) => (
            <li className="break-all" key={label}>
              {label}
            </li>
          ))}
        </ul>
      </div>
      {installation.availableRequest ? (
        <Button
          variant="primary"
          className="w-full justify-center"
          onClick={() => void request.request(variant)}
        >
          <FilePlus2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t(
            variant === "update"
              ? "installation.createUpdateRequest"
              : "installation.createRequest",
          )}
        </Button>
      ) : null}
    </div>
  );
}
