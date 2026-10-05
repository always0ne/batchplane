import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { DashboardCard } from "../dashboard-cards";

export function DashboardCardView({ card }: { card: DashboardCard }) {
  const { t } = useTranslation("dashboard");
  const Icon = card.icon;
  const cardClassName =
    "rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition";
  const toneClassName = {
    danger: "text-red-700",
    neutral: "text-bp-muted",
    success: "text-emerald-700",
    warning: "text-amber-700",
  }[card.tone];

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-bp-muted">
          {t(`cards.${card.key}`)}
        </p>
        <Icon className={`h-5 w-5 ${toneClassName}`} aria-hidden="true" />
      </div>
      <p className="mt-4 text-3xl font-bold text-bp-graphite">{card.value}</p>
      <p className="mt-2 text-xs font-semibold text-bp-muted">
        {t(`cardHints.${card.key}`)}
      </p>
    </>
  );

  if (card.to) {
    return (
      <Link
        className={`${cardClassName} hover:border-bp-git hover:shadow-md`}
        to={card.to}
      >
        {content}
      </Link>
    );
  }

  return <article className={cardClassName}>{content}</article>;
}
