import { Loader2, Plus, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button, ButtonLink } from "../../ui/Button";

type BatchListToolbarProps = {
  isLoading: boolean;
  onRefresh: () => void;
};

export function BatchListToolbar({
  isLoading,
  onRefresh,
}: BatchListToolbarProps) {
  const { t } = useTranslation("batches");

  return (
    <div className="flex flex-wrap gap-3">
      <Button disabled={isLoading} onClick={onRefresh} variant="secondary">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        )}
        {t("actions.refresh")}
      </Button>
      <ButtonLink to="/batches/new" variant="primary">
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t("actions.register")}
      </ButtonLink>
    </div>
  );
}
