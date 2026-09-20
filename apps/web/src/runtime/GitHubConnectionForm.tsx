import { KeyRound, Loader2, Plug, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/Button";
import { StatusRow } from "../components/StatusRow";
import type { WorkspaceConnectionEditorProps } from "../client/workspace-connection-editor";
import { redactGitHubToken } from "./github-session";
import { useGitHubConnection } from "./useGitHubConnection";

type Connection = ReturnType<typeof useGitHubConnection>;

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
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block min-w-0 text-sm font-semibold text-bp-graphite">
          {t("github.owner")}
          <input
            autoComplete="off"
            className={inputClassName}
            onChange={(event) => updateOwner(event.target.value)}
            placeholder="always0ne"
            value={connection.owner}
          />
        </label>
        <label className="block min-w-0 text-sm font-semibold text-bp-graphite">
          {t("github.repo")}
          <input
            autoComplete="off"
            className={inputClassName}
            onChange={(event) => updateRepo(event.target.value)}
            placeholder="batch"
            value={connection.repo}
          />
        </label>
      </div>
      <label className="mt-4 block text-sm font-semibold text-bp-graphite">
        {t("github.token")}
        <input
          autoComplete="off"
          className={inputClassName}
          onChange={(event) => updateToken(event.target.value)}
          placeholder="github_pat_..."
          type="password"
          value={connection.token}
        />
      </label>
      <p className="mt-3 text-sm text-bp-muted">{t("tokenPolicy")}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <span title={!canSubmit ? t("errors.requiredFields") : undefined}>
          <Button disabled={!canSubmit} type="submit">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {t("github.save")}
          </Button>
        </span>
        <span
          title={
            !canSubmit
              ? t("errors.requiredFields")
              : checking
                ? t("session.checking")
                : undefined
          }
        >
          <Button
            disabled={!canSubmit || checking}
            onClick={() => void check()}
            variant="primary"
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plug className="h-4 w-4" aria-hidden="true" />
            )}
            {t("github.check")}
          </Button>
        </span>
        <span
          title={
            !connection.token && !connection.storedSession
              ? t("session.empty")
              : undefined
          }
        >
          <Button
            className="text-bp-muted"
            disabled={!connection.token && !connection.storedSession}
            onClick={clear}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t("github.clear")}
          </Button>
        </span>
      </div>
      <GitHubSessionSummary connection={connection} />
    </form>
  );
}

export function GitHubSessionSummary({
  connection,
}: {
  connection: Connection;
}) {
  const { t } = useTranslation("settings");
  if (connection.error)
    return (
      <p
        role="alert"
        className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
      >
        {t(`errors.${connection.error}`)}
      </p>
    );
  const session = connection.storedSession;
  return (
    <dl className="mt-5 space-y-3 text-sm">
      <StatusRow
        label={t("session.status")}
        value={t(session ? "session.stored" : "session.empty")}
      />
      {session ? (
        <StatusRow
          label={t("session.repository")}
          value={`${session.owner}/${session.repo}`}
        />
      ) : null}
      {session || connection.token ? (
        <StatusRow
          label={t("session.token")}
          value={redactGitHubToken(session?.token ?? connection.token)}
        />
      ) : null}
    </dl>
  );
}

const inputClassName =
  "mt-2 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20";
