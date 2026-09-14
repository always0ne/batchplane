import { useTranslation } from "react-i18next";
import type { WorkspaceConnectionEditor } from "../../client/workspace-connection-editor";
import { PageHeader } from "../../ui/PageHeader";
import { WorkspaceConnectionStatus } from "./WorkspaceConnectionStatus";
import { WorkspaceInstallation } from "./WorkspaceInstallation";
import { WorkspacePolicy } from "./WorkspacePolicy";
import { useWorkspaceInspection } from "./useWorkspaceInspection";

export function WorkspacePage({
  connectionEditor: ConnectionEditor,
}: {
  connectionEditor: WorkspaceConnectionEditor;
}) {
  const { t } = useTranslation("settings");
  const { state: inspection, check, reset } = useWorkspaceInspection();
  return (
    <section>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ConnectionEditor
          onCheckConnection={check}
          onConnectionChanged={reset}
          checking={inspection.type === "checking"}
        />
        <div className="min-w-0 space-y-4">
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-sm font-semibold text-bp-graphite">
              {t("session.title")}
            </h2>
            <WorkspaceConnectionStatus state={inspection} />
          </div>
          <WorkspaceInstallation inspection={inspection} />
          <WorkspacePolicy inspection={inspection} />
        </div>
      </div>
    </section>
  );
}
