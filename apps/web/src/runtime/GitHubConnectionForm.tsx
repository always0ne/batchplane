import { KeyRound } from "lucide-react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { WorkspaceConnectionEditorProps } from "../client/workspace-connection-editor";
import { GitHubConnectionActions } from "./github-connection/GitHubConnectionActions";
import { GitHubConnectionFields } from "./github-connection/GitHubConnectionFields";
import { GitHubSessionSummary } from "./github-connection/GitHubSessionSummary";
import { useGitHubConnection } from "./useGitHubConnection";

export function LiteGitHubConnectionEditor({
  checking,
  onCheckConnection,
  onConnectionChanged,
}: WorkspaceConnectionEditorProps) {
  const { t } = useTranslation("settings");
  const connection = useGitHubConnection();
  const canSubmit = Boolean(
    connection.owner.trim() &&
    connection.repo.trim() &&
    connection.token.trim(),
  );

  function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConnectionChanged();
    try {
      connection.save();
    } catch {
      // The connection owns the localized credential validation state.
    }
  }

  async function check() {
    onConnectionChanged();
    try {
      connection.save();
    } catch {
      return;
    }
    await onCheckConnection();
  }

  function clear() {
    onConnectionChanged();
    connection.clear();
  }

  function updateOwner(value: string) {
    connection.setOwner(value);
    onConnectionChanged();
  }

  function updateRepo(value: string) {
    connection.setRepo(value);
    onConnectionChanged();
  }

  function updateToken(value: string) {
    connection.setToken(value);
    onConnectionChanged();
  }

  return (
    <form
      className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      onSubmit={saveSession}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-bp-graphite">
            {t("github.title")}
          </h2>
          <p className="mt-2 text-sm text-bp-muted">{t("github.subtitle")}</p>
        </div>
        <KeyRound className="h-5 w-5 shrink-0 text-bp-git" aria-hidden="true" />
      </div>
      <GitHubConnectionFields
        owner={connection.owner}
        repo={connection.repo}
        token={connection.token}
        onOwnerChange={updateOwner}
        onRepoChange={updateRepo}
        onTokenChange={updateToken}
      />
      <GitHubConnectionActions
        canSubmit={canSubmit}
        canClear={Boolean(connection.token || connection.storedSession)}
        checking={checking}
        onCheck={check}
        onClear={clear}
      />
      <GitHubSessionSummary
        storedSession={connection.storedSession}
        token={connection.token}
        error={connection.error}
      />
    </form>
  );
}
