import type { WorkspacePolicyRequest } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { StatusRow } from "../../../../components/StatusRow";

export function PolicyChangeRequestResult({
  result,
}: {
  result: WorkspacePolicyRequest;
}) {
  const { t } = useTranslation("settings");

  return (
    <div className="space-y-4">
      <dl>
        <StatusRow
          label={t("workspacePolicy.requestedMode")}
          value={t(
            `workspacePolicy.modes.${result.requestedPolicy.approval.mode}`,
          )}
        />
      </dl>
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <p className="font-semibold">{t("workspacePolicy.success")}</p>
        <a
          className="mt-2 inline-flex break-words font-semibold underline"
          href={result.request.sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          {result.request.label}
        </a>
      </div>
    </div>
  );
}
