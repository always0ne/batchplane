import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Button } from "../../../components/Button";

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

  function cancelConfirmation() {
    setPanelOpen(false);
    setConfirmation("");
  }

  function openConfirmation() {
    setPanelOpen(true);
  }

  const showConfirmation = !blocked && panelOpen;
  const requestDeleteClassName = blocked
    ? "mt-4 w-full justify-center border-red-200 text-red-400"
    : "mt-4 w-full justify-center border-red-200 text-red-700";
  const requestDeleteTitle = blocked ? blockedReason : undefined;

  return (
    <section className="mt-5 border-t border-slate-100 pt-5">
      <h3 className="text-sm font-bold text-red-700">
        {t("detail.delete.title")}
      </h3>
      <p className="mt-2 text-sm text-bp-muted">
        {t("detail.delete.description")}
      </p>
      {showConfirmation ? (
        <BatchDeleteConfirmation
          batchId={batchId}
          canConfirm={canConfirm}
          confirmation={confirmation}
          onCancel={cancelConfirmation}
          onConfirm={requestDelete}
          onConfirmationChange={setConfirmation}
        />
      ) : (
        <Button
          className={requestDeleteClassName}
          disabled={blocked}
          onClick={blocked ? undefined : openConfirmation}
          title={requestDeleteTitle}
          variant="secondary"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t("actions.requestDelete")}
        </Button>
      )}
    </section>
  );
}

function BatchDeleteConfirmation({
  batchId,
  canConfirm,
  confirmation,
  onCancel,
  onConfirm,
  onConfirmationChange,
}: {
  batchId: string;
  canConfirm: boolean;
  confirmation: string;
  onCancel: () => void;
  onConfirm: () => void;
  onConfirmationChange: (value: string) => void;
}) {
  const { t } = useTranslation("batches");

  return (
    <div className="mt-4 space-y-3 rounded-md border border-red-200 bg-red-50 p-3">
      <label className="block text-xs font-semibold uppercase text-red-700">
        {t("detail.delete.confirmationLabel")}
        <input
          className="mt-1 w-full rounded-md border border-red-200 bg-white px-3 py-2 font-mono text-sm text-bp-graphite outline-none focus:border-red-500"
          onChange={(event) => onConfirmationChange(event.target.value)}
          placeholder={batchId}
          value={confirmation}
        />
      </label>
      <p className="text-xs text-red-700">{t("detail.delete.blocked")}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          className="flex-1 justify-center bg-red-600 text-white disabled:bg-slate-300"
          disabled={!canConfirm}
          onClick={onConfirm}
          variant="secondary"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t("actions.createDeleteRequest")}
        </Button>
        <Button onClick={onCancel} variant="secondary">
          {t("actions.cancel")}
        </Button>
      </div>
    </div>
  );
}
