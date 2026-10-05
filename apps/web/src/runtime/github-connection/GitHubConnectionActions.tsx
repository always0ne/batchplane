import { KeyRound, Loader2, Plug, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";

export function GitHubConnectionActions({
  canSubmit,
  canClear,
  checking,
  onCheck,
  onClear,
}: {
  canSubmit: boolean;
  canClear: boolean;
  checking: boolean;
  onCheck: () => Promise<void>;
  onClear: () => void;
}) {
  const { t } = useTranslation("settings");
  let checkUnavailable: string | undefined;
  if (!canSubmit) {
    checkUnavailable = t("errors.requiredFields");
  } else if (checking) {
    checkUnavailable = t("session.checking");
  }

  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <span title={!canSubmit ? t("errors.requiredFields") : undefined}>
        <Button disabled={!canSubmit} type="submit">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {t("github.save")}
        </Button>
      </span>
      <span title={checkUnavailable}>
        <Button
          disabled={!canSubmit || checking}
          onClick={() => void onCheck()}
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
      <span title={!canClear ? t("session.empty") : undefined}>
        <Button
          className="text-bp-muted"
          disabled={!canClear}
          onClick={onClear}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t("github.clear")}
        </Button>
      </span>
    </div>
  );
}
