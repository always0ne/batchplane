import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../ui/PageHeader";
import { WorkspaceConnectionStatus } from "./WorkspaceConnectionStatus";
import { WorkspaceInstallation } from "./WorkspaceInstallation";
import { WorkspacePolicy } from "./WorkspacePolicy";
import { useWorkspaceInspection } from "./useWorkspaceInspection";

export function WorkspacePage({
  connectionForm,
  storedConnection,
  prepareRequest,
}: {
  connectionForm: (controls: {
    checkConnection: () => Promise<void>;
    resetConnection: () => void;
    checking: boolean;
  }) => ReactNode;
  storedConnection: ReactNode;
  prepareRequest: () => void;
}) {
  const { t } = useTranslation("settings");
  const { state: inspection, check, reset } = useWorkspaceInspection();
  return (
    <section>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {connectionForm({
          checkConnection: check,
          resetConnection: reset,
          checking: inspection.type === "checking",
        })}
        <div className="min-w-0 space-y-4">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-bp-graphite">
                  {t("session.title")}
                </h2>
                <p className="mt-2 text-sm text-bp-muted">
                  {t("session.subtitle")}
                </p>
              </div>
              <CheckCircle2
                className="h-5 w-5 shrink-0 text-bp-git"
                aria-hidden="true"
              />
            </div>
            <WorkspaceConnectionStatus
              state={inspection}
              storedConnection={storedConnection}
            />
          </article>
          <WorkspaceInstallation
            inspection={inspection}
            prepareRequest={prepareRequest}
          />
          <WorkspacePolicy
            inspection={inspection}
            prepareRequest={prepareRequest}
          />
        </div>
      </div>
    </section>
  );
}
