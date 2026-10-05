import { useTranslation } from "react-i18next";
import { StatusRow } from "../../components/StatusRow";
import { redactGitHubToken } from "../github-session";
import type { useGitHubConnection } from "../useGitHubConnection";

export function GitHubSessionSummary({
  storedSession,
  token,
  error,
}: Pick<
  ReturnType<typeof useGitHubConnection>,
  "storedSession" | "token" | "error"
>) {
  const { t } = useTranslation("settings");
  if (error) {
    return (
      <p
        role="alert"
        className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
      >
        {t(`errors.${error}`)}
      </p>
    );
  }

  return (
    <dl className="mt-5 space-y-3 text-sm">
      <StatusRow
        label={t("session.status")}
        value={t(storedSession ? "session.stored" : "session.empty")}
      />
      {storedSession ? (
        <StatusRow
          label={t("session.repository")}
          value={`${storedSession.owner}/${storedSession.repo}`}
        />
      ) : null}
      {storedSession || token ? (
        <StatusRow
          label={t("session.token")}
          value={redactGitHubToken(storedSession?.token ?? token)}
        />
      ) : null}
    </dl>
  );
}
