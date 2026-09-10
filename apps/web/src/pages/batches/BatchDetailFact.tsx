export function BatchDetailFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 break-all text-sm font-bold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}
