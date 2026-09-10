import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Button } from "../../ui/Button";

type Props = {
  batchId: string;
  blocked: boolean;
  blockedReason: string;
};

export function BatchDeleteRequestAction({
  batchId,
  blocked,
  blockedReason,
}: Props) {
  const { t } = useTranslation("batches");
  const navigate = useNavigate();
  const [confirmation, setConfirmation] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const canConfirm = confirmation.trim() === batchId;

  function requestDelete() {
    if (!canConfirm || blocked) return;
    navigate(`/batches/new?delete=${encodeURIComponent(batchId)}`);
  }

  return (
    <section className="mt-5 border-t border-slate-100 pt-5">
      <h3 className="text-sm font-bold text-red-700">
        {t("detail.delete.title")}
      </h3>
      <p className="mt-2 text-sm text-bp-muted">
        {t("detail.delete.description")}
      </p>
      {blocked ? (
        <Button
          className="mt-4 w-full justify-center border-red-200 text-red-400"
          disabled
          title={blockedReason}
          variant="secondary"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t("actions.requestDelete")}
        </Button>
      ) : panelOpen ? (
        <div className="mt-4 space-y-3 rounded-md border border-red-200 bg-red-50 p-3">
          <label className="block text-xs font-semibold uppercase text-red-700">
            {t("detail.delete.confirmationLabel")}
            <input
              className="mt-1 w-full rounded-md border border-red-200 bg-white px-3 py-2 font-mono text-sm text-bp-graphite outline-none focus:border-red-500"
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={batchId}
              value={confirmation}
            />
          </label>
          <p className="text-xs text-red-700">{t("detail.delete.blocked")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              className="flex-1 justify-center bg-red-600 text-white disabled:bg-slate-300"
              disabled={!canConfirm}
              onClick={requestDelete}
              variant="secondary"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t("actions.createDeleteRequest")}
            </Button>
            <Button
              onClick={() => {
                setPanelOpen(false);
                setConfirmation("");
              }}
              variant="secondary"
            >
              {t("actions.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className="mt-4 w-full justify-center border-red-200 text-red-700"
          onClick={() => setPanelOpen(true)}
          variant="secondary"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t("actions.requestDelete")}
        </Button>
      )}
    </section>
  );
}
