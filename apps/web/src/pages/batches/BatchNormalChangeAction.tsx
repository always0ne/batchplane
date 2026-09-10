import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button, ButtonLink } from "../../ui/Button";

type Props = {
  batchId: string;
  blocked: boolean;
  blockedReason: string;
};

export function BatchNormalChangeAction({
  batchId,
  blocked,
  blockedReason,
}: Props) {
  const { t } = useTranslation("batches");

  return (
    <section className="mt-5 border-t border-slate-100 pt-5">
      <h3 className="text-sm font-bold text-bp-graphite">
        {t("detail.change.title")}
      </h3>
      <p className="mt-2 text-sm text-bp-muted">
        {t("detail.change.description")}
      </p>
      {blocked ? (
        <Button
          className="mt-4 w-full justify-center"
          disabled
          title={blockedReason}
          variant="secondary"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {t("actions.requestChange")}
        </Button>
      ) : (
        <ButtonLink
          className="mt-4 w-full justify-center"
          to={`/batches/new?change=${encodeURIComponent(batchId)}`}
          variant="secondary"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {t("actions.requestChange")}
        </ButtonLink>
      )}
    </section>
  );
}
