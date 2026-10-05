import { useTranslation } from "react-i18next";
import { ButtonLink } from "../../../components/ButtonLink";
import { formatWorkTime, type WorkRow } from "../work-rows";
import { WorkIcon } from "./WorkIcon";

export function MyWorkListItem({ item }: { item: WorkRow }) {
  const { t } = useTranslation("myWork");

  return (
    <li className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 gap-3">
        <WorkIcon kind={item.kind} priority={item.priority} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-bp-muted">
              {t(`itemLabels.${item.labelKey}`)}
            </span>
            {item.priority === "high" ? (
              <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
                {t("values.highPriority")}
              </span>
            ) : null}
          </div>
          <p className="mt-2 break-words text-sm font-bold text-bp-graphite">
            {item.title}
          </p>
          <p className="mt-1 break-words text-sm text-bp-muted">
            {t(`itemDescriptions.${item.descriptionKey}`)}
          </p>
          <p className="mt-2 text-xs font-semibold text-bp-muted">
            {t("values.actorTime", {
              actor: item.actor || t("values.unknownActor"),
              time: formatWorkTime(item.occurredAt, t("values.unknownTime")),
            })}
          </p>
        </div>
      </div>
      <ButtonLink
        className="h-10 justify-center hover:bg-bp-graphite"
        size="compact"
        to={item.to}
        variant="primary"
      >
        {t(`itemActions.${item.actionKey}`)}
      </ButtonLink>
    </li>
  );
}
