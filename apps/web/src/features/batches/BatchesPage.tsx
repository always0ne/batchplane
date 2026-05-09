import {
  createGitHubLiteClient,
  GitHubLiteApiError,
} from "@batchtrail/github-lite";
import type { BatchDefinition } from "@batchtrail/domain";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../shared/components/PageHeader";
import { readGitHubSession } from "../lite-setup/github-session";
import { loadBatchDefinitions } from "./batch-repository";

type BatchListState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "loaded"; batches: BatchDefinition[]; defaultBranch: string }
  | { type: "error"; message: string };

export function BatchesPage() {
  const { t } = useTranslation("batches");
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<BatchListState>({ type: "loading" });

  useEffect(() => {
    let ignoreResult = false;

    async function loadBatches() {
      const session = readGitHubSession();

      if (!session) {
        setState({ type: "no-session" });
        return;
      }

      setState({ type: "loading" });

      try {
        const client = createGitHubLiteClient({ token: session.token });
        const repository = await client.getRepository(session);
        const batches = await loadBatchDefinitions({
          client,
          ref: repository.defaultBranch,
          repository: session,
        });

        if (!ignoreResult) {
          setState({
            type: "loaded",
            batches,
            defaultBranch: repository.defaultBranch,
          });
        }
      } catch (error) {
        if (!ignoreResult) {
          setState({ type: "error", message: formatBatchListError(error) });
        }
      }
    }

    void loadBatches();

    return () => {
      ignoreResult = true;
    };
  }, [reloadToken]);

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-bt-graphite disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={state.type === "loading"}
            onClick={() => setReloadToken((current) => current + 1)}
            type="button"
          >
            {state.type === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {t("actions.refresh")}
          </button>
          <Link
            className="inline-flex items-center gap-2 rounded-md bg-bt-control px-4 py-2 text-sm font-semibold text-white"
            to="/batches/new"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("actions.register")}
          </Link>
        </div>
      </div>
      <BatchListContent state={state} />
    </section>
  );
}

function BatchListContent({ state }: { state: BatchListState }) {
  const { t } = useTranslation("batches");

  if (state.type === "loading") {
    return (
      <StatusPanel>
        <Loader2 className="h-5 w-5 animate-spin text-bt-git" />
        <span>{t("states.loading")}</span>
      </StatusPanel>
    );
  }

  if (state.type === "no-session") {
    return (
      <StatusPanel>
        <span>{t("states.noSession")}</span>
        <Link
          className="font-semibold text-bt-control underline"
          to="/lite/setup"
        >
          {t("actions.openSetup")}
        </Link>
      </StatusPanel>
    );
  }

  if (state.type === "error") {
    return (
      <StatusPanel tone="danger">
        <span>{state.message}</span>
      </StatusPanel>
    );
  }

  if (state.batches.length === 0) {
    return (
      <StatusPanel>
        <span>{t("states.empty", { branch: state.defaultBranch })}</span>
      </StatusPanel>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[920px] border-collapse text-left">
        <thead className="bg-slate-50 text-sm text-bt-muted">
          <tr>
            <th className="px-4 py-3 font-semibold">{t("table.batchId")}</th>
            <th className="px-4 py-3 font-semibold">{t("table.name")}</th>
            <th className="px-4 py-3 font-semibold">{t("table.owner")}</th>
            <th className="px-4 py-3 font-semibold">
              {t("table.environment")}
            </th>
            <th className="px-4 py-3 font-semibold">
              {t("table.criticality")}
            </th>
            <th className="px-4 py-3 font-semibold">{t("table.status")}</th>
            <th className="px-4 py-3 font-semibold">{t("table.gate")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {state.batches.map((batch) => (
            <tr key={batch.batchId}>
              <td className="px-4 py-4 font-mono text-sm text-bt-graphite">
                {batch.batchId}
              </td>
              <td className="px-4 py-4 text-sm font-semibold text-bt-graphite">
                {batch.name}
              </td>
              <td className="px-4 py-4 text-sm text-bt-graphite">
                {batch.owner}
              </td>
              <td className="px-4 py-4 text-sm text-bt-graphite">
                {batch.environment}
              </td>
              <td className="px-4 py-4 text-sm text-bt-graphite">
                {batch.criticality}
              </td>
              <td className="px-4 py-4 text-sm text-bt-graphite">
                {batch.status}
              </td>
              <td className="px-4 py-4 text-sm text-bt-graphite">
                {batch.gateRequired ? t("values.required") : t("values.off")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPanel({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "danger";
}) {
  const className =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-slate-200 bg-white text-bt-muted";

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-lg border p-5 text-sm font-semibold shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function formatBatchListError(error: unknown): string {
  if (error instanceof GitHubLiteApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to load batch definitions.";
}
