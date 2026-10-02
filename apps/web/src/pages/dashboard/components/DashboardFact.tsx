export function DashboardFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 truncate text-sm font-bold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}
