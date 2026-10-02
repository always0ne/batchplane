export function RequestFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="font-bold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}
