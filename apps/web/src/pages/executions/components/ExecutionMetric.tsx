export function ExecutionMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "danger" | "info" | "neutral" | "success" | "warning";
  value: number;
}) {
  const toneClass = {
    danger: "text-red-700",
    info: "text-sky-700",
    neutral: "text-bp-muted",
    success: "text-emerald-700",
    warning: "text-orange-700",
  }[tone];

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-bp-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</p>
    </article>
  );
}
