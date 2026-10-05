import type { ChangeRequestDetail } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { ChangeRequestMeta } from "./ChangeRequestMeta";

export function ChangeSummary({ detail }: { detail: ChangeRequestDetail }) {
  const { t } = useTranslation("approvals");
  const evidence =
    detail.evidence.kind === "VERIFIED_V2" ? detail.evidence : undefined;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("registrationDetail.summaryTitle")}
      </h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <ChangeRequestMeta label={t("fields.batchId")} value={detail.batchId} />
        <ChangeRequestMeta
          label={t("fields.requestType")}
          value={t(`values.registrationRequestTypes.${detail.mode}`)}
        />
        <ChangeRequestMeta
          label={t("fields.requestedBy")}
          value={detail.requester}
        />
        <ChangeRequestMeta
          label={t("fields.requestId")}
          value={evidence?.governedChangeId ?? "-"}
        />
        <ChangeRequestMeta
          label={t("fields.requestDigest")}
          value={evidence?.requestDigest ?? "-"}
        />
        <ChangeRequestMeta
          label={t("fields.targetRevisionDigest")}
          value={evidence?.targetRevisionDigest ?? "-"}
        />
      </dl>
    </article>
  );
}
