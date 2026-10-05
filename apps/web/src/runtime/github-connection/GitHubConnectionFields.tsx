import { useTranslation } from "react-i18next";

export function GitHubConnectionFields({
  owner,
  repo,
  token,
  onOwnerChange,
  onRepoChange,
  onTokenChange,
}: {
  owner: string;
  repo: string;
  token: string;
  onOwnerChange: (value: string) => void;
  onRepoChange: (value: string) => void;
  onTokenChange: (value: string) => void;
}) {
  const { t } = useTranslation("settings");

  return (
    <>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block min-w-0 text-sm font-semibold text-bp-graphite">
          {t("github.owner")}
          <input
            autoComplete="off"
            className={inputClassName}
            onChange={(event) => onOwnerChange(event.target.value)}
            placeholder="always0ne"
            value={owner}
          />
        </label>
        <label className="block min-w-0 text-sm font-semibold text-bp-graphite">
          {t("github.repo")}
          <input
            autoComplete="off"
            className={inputClassName}
            onChange={(event) => onRepoChange(event.target.value)}
            placeholder="batch"
            value={repo}
          />
        </label>
      </div>
      <label className="mt-4 block text-sm font-semibold text-bp-graphite">
        {t("github.token")}
        <input
          autoComplete="off"
          className={inputClassName}
          onChange={(event) => onTokenChange(event.target.value)}
          placeholder="github_pat_..."
          type="password"
          value={token}
        />
      </label>
      <p className="mt-3 text-sm text-bp-muted">{t("tokenPolicy")}</p>
    </>
  );
}

const inputClassName =
  "mt-2 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20";
