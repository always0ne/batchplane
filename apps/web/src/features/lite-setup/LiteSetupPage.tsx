import {
  createGitHubLiteClient,
  GitHubLiteApiError,
  type GitHubPullRequest,
} from "@batchtrail/github-lite";
import {
  AlertCircle,
  CheckCircle2,
  GitPullRequest,
  KeyRound,
  Loader2,
  Plug,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../shared/components/PageHeader";
import {
  clearGitHubSession,
  readGitHubSession,
  redactGitHubToken,
  writeGitHubSession,
  type GitHubSession,
} from "./github-session";
import {
  checkLiteInstallationStatus,
  createLiteInstallationPullRequest,
  type LiteInstallationStatus,
} from "./installation-model";

type ConnectionCheckState =
  | { type: "idle" }
  | { type: "stored"; session: GitHubSession }
  | { type: "checking" }
  | {
      type: "connected";
      login: string;
      repository: string;
      defaultBranch: string;
    }
  | { type: "error"; message: string };

type InstallationCheckState =
  | { type: "idle" }
  | { type: "checking" }
  | { type: "installed"; status: LiteInstallationStatus }
  | { type: "missing"; status: LiteInstallationStatus }
  | { type: "creating" }
  | { type: "success"; pullRequest: GitHubPullRequest }
  | { type: "error"; message: string };

export function LiteSetupPage() {
  const { t } = useTranslation(["settings", "common"]);
  const initialSession = useMemo(() => readGitHubSession(), []);
  const [owner, setOwner] = useState(initialSession?.owner ?? "");
  const [repo, setRepo] = useState(initialSession?.repo ?? "");
  const [token, setToken] = useState(initialSession?.token ?? "");
  const [checkState, setCheckState] = useState<ConnectionCheckState>(
    initialSession
      ? { type: "stored", session: initialSession }
      : { type: "idle" },
  );
  const [installationState, setInstallationState] =
    useState<InstallationCheckState>({ type: "idle" });

  const canSubmit = Boolean(owner.trim() && repo.trim() && token.trim());

  function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const session = writeGitHubSession({ owner, repo, token });
      setOwner(session.owner);
      setRepo(session.repo);
      setToken(session.token);
      setCheckState({ type: "stored", session });
      setInstallationState({ type: "idle" });
    } catch (error) {
      setCheckState({
        type: "error",
        message:
          error instanceof Error
            ? t("settings:errors.requiredFields")
            : t("settings:errors.unknown"),
      });
    }
  }

  function clearSession() {
    clearGitHubSession();
    setToken("");
    setCheckState({ type: "idle" });
    setInstallationState({ type: "idle" });
  }

  async function checkConnection() {
    let session: GitHubSession;

    try {
      session = writeGitHubSession({ owner, repo, token });
    } catch (error) {
      setCheckState({
        type: "error",
        message:
          error instanceof Error
            ? t("settings:errors.requiredFields")
            : t("settings:errors.unknown"),
      });
      return;
    }

    setCheckState({ type: "checking" });
    setInstallationState({ type: "checking" });

    try {
      const client = createGitHubLiteClient({ token: session.token });
      const [user, repository] = await Promise.all([
        client.getCurrentUser(),
        client.getRepository(session),
      ]);

      setOwner(repository.owner);
      setRepo(repository.repo);
      setCheckState({
        type: "connected",
        login: user.login,
        repository: `${repository.owner}/${repository.repo}`,
        defaultBranch: repository.defaultBranch,
      });
      const installationStatus = await checkLiteInstallationStatus({
        client,
        ref: repository.defaultBranch,
        repo: session,
      });
      setInstallationState(
        installationStatus.installed
          ? { type: "installed", status: installationStatus }
          : { type: "missing", status: installationStatus },
      );
    } catch (error) {
      setCheckState({
        type: "error",
        message: formatConnectionError(
          error,
          t("settings:errors.connectionFailed"),
        ),
      });
      setInstallationState({
        type: "error",
        message: formatConnectionError(
          error,
          t("settings:errors.connectionFailed"),
        ),
      });
    }
  }

  async function createInstallationPullRequest() {
    let session: GitHubSession;

    try {
      session = writeGitHubSession({ owner, repo, token });
    } catch (error) {
      setInstallationState({
        type: "error",
        message:
          error instanceof Error
            ? t("settings:errors.requiredFields")
            : t("settings:errors.unknown"),
      });
      return;
    }

    setInstallationState({ type: "creating" });

    try {
      const client = createGitHubLiteClient({ token: session.token });
      const repository = await client.getRepository(session);
      const { pullRequest } = await createLiteInstallationPullRequest({
        client,
        defaultBranch: repository.defaultBranch,
        repo: session,
      });

      setInstallationState({ type: "success", pullRequest });
    } catch (error) {
      setInstallationState({
        type: "error",
        message: formatConnectionError(error, t("settings:errors.unknown")),
      });
    }
  }

  return (
    <section>
      <PageHeader
        title={t("settings:title")}
        subtitle={t("settings:subtitle")}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <form
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          onSubmit={saveSession}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-bt-graphite">
                {t("settings:github.title")}
              </h2>
              <p className="mt-2 text-sm text-bt-muted">
                {t("settings:github.subtitle")}
              </p>
            </div>
            <KeyRound className="h-5 w-5 text-bt-git" aria-hidden="true" />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-semibold text-bt-graphite">
              {t("settings:github.owner")}
              <input
                autoComplete="off"
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-bt-graphite outline-none focus:border-bt-git focus:ring-2 focus:ring-bt-git/20"
                onChange={(event) => setOwner(event.target.value)}
                placeholder="always0ne"
                value={owner}
              />
            </label>
            <label className="block text-sm font-semibold text-bt-graphite">
              {t("settings:github.repo")}
              <input
                autoComplete="off"
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-bt-graphite outline-none focus:border-bt-git focus:ring-2 focus:ring-bt-git/20"
                onChange={(event) => setRepo(event.target.value)}
                placeholder="batchtrail"
                value={repo}
              />
            </label>
          </div>

          <label className="mt-4 block text-sm font-semibold text-bt-graphite">
            {t("settings:github.token")}
            <input
              autoComplete="off"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-bt-graphite outline-none focus:border-bt-git focus:ring-2 focus:ring-bt-git/20"
              onChange={(event) => setToken(event.target.value)}
              placeholder="github_pat_..."
              type="password"
              value={token}
            />
          </label>

          <p className="mt-3 text-sm text-bt-muted">
            {t("settings:tokenPolicy")}
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-md bg-bt-control px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!canSubmit}
              type="submit"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {t("settings:github.save")}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-bt-graphite disabled:cursor-not-allowed disabled:text-slate-400"
              disabled={!canSubmit || checkState.type === "checking"}
              onClick={() => void checkConnection()}
              type="button"
            >
              {checkState.type === "checking" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plug className="h-4 w-4" aria-hidden="true" />
              )}
              {t("settings:github.check")}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-bt-muted disabled:cursor-not-allowed disabled:text-slate-400"
              disabled={!token && checkState.type === "idle"}
              onClick={clearSession}
              type="button"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t("settings:github.clear")}
            </button>
          </div>
        </form>

        <div className="space-y-4">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-bt-graphite">
                  {t("settings:session.title")}
                </h2>
                <p className="mt-2 text-sm text-bt-muted">
                  {t("common:app.tagline")}
                </p>
              </div>
              <CheckCircle2
                className="h-5 w-5 text-bt-git"
                aria-hidden="true"
              />
            </div>
            <SessionStatus state={checkState} token={token} />
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-bt-graphite">
                  {t("settings:installation.title")}
                </h2>
                <p className="mt-2 text-sm text-bt-muted">
                  {t("settings:installation.subtitle")}
                </p>
              </div>
              <ShieldCheck className="h-5 w-5 text-bt-git" aria-hidden="true" />
            </div>
            <InstallationStatus
              onInstall={() => void createInstallationPullRequest()}
              state={installationState}
            />
          </article>
        </div>
      </div>
    </section>
  );
}

function InstallationStatus({
  onInstall,
  state,
}: {
  onInstall: () => void;
  state: InstallationCheckState;
}) {
  const { t } = useTranslation("settings");

  if (state.type === "installed") {
    return (
      <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
        {t("installation.installed")}
      </div>
    );
  }

  if (state.type === "missing") {
    return (
      <div className="mt-5 space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-semibold">{t("installation.missing")}</p>
          <ul className="mt-2 space-y-1 text-xs font-mono">
            {state.status.missingPaths.map((path) => (
              <li className="break-all" key={path}>
                {path}
              </li>
            ))}
          </ul>
        </div>
        <button
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-bt-control px-4 py-2 text-sm font-semibold text-white"
          onClick={onInstall}
          type="button"
        >
          <GitPullRequest className="h-4 w-4" aria-hidden="true" />
          {t("installation.createPullRequest")}
        </button>
      </div>
    );
  }

  if (state.type === "checking" || state.type === "creating") {
    return (
      <div className="mt-5 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-bt-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {state.type === "checking"
          ? t("installation.checking")
          : t("installation.creating")}
      </div>
    );
  }

  if (state.type === "success") {
    return (
      <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <p className="font-semibold">{t("installation.success")}</p>
        <a
          className="mt-2 inline-flex font-semibold underline"
          href={state.pullRequest.url}
          rel="noreferrer"
          target="_blank"
        >
          #{state.pullRequest.number} {state.pullRequest.title}
        </a>
      </div>
    );
  }

  if (state.type === "error") {
    return (
      <div className="mt-5 flex gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="font-semibold">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-bt-muted">
      {t("installation.idle")}
    </div>
  );
}

function SessionStatus({
  state,
  token,
}: {
  state: ConnectionCheckState;
  token: string;
}) {
  const { t } = useTranslation("settings");

  if (state.type === "connected") {
    return (
      <dl className="mt-5 space-y-3 text-sm">
        <StatusRow label={t("session.status")} value={t("session.connected")} />
        <StatusRow label={t("session.user")} value={state.login} />
        <StatusRow label={t("session.repository")} value={state.repository} />
        <StatusRow
          label={t("session.defaultBranch")}
          value={state.defaultBranch}
        />
      </dl>
    );
  }

  if (state.type === "stored") {
    return (
      <dl className="mt-5 space-y-3 text-sm">
        <StatusRow label={t("session.status")} value={t("session.stored")} />
        <StatusRow
          label={t("session.repository")}
          value={`${state.session.owner}/${state.session.repo}`}
        />
        <StatusRow
          label={t("session.token")}
          value={redactGitHubToken(state.session.token)}
        />
      </dl>
    );
  }

  if (state.type === "checking") {
    return (
      <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-bt-muted">
        {t("session.checking")}
      </div>
    );
  }

  if (state.type === "error") {
    return (
      <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
        {state.message}
      </div>
    );
  }

  return (
    <dl className="mt-5 space-y-3 text-sm">
      <StatusRow label={t("session.status")} value={t("session.empty")} />
      {token ? (
        <StatusRow
          label={t("session.token")}
          value={redactGitHubToken(token)}
        />
      ) : null}
    </dl>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md bg-slate-50 px-3 py-2">
      <dt className="font-medium text-bt-muted">{label}</dt>
      <dd className="text-right font-semibold text-bt-graphite">{value}</dd>
    </div>
  );
}

function formatConnectionError(error: unknown, fallback: string): string {
  if (error instanceof GitHubLiteApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
