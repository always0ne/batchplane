export function ExecutionRunFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="font-semibold uppercase tracking-normal text-bp-muted">
        {label}
      </dt>
      <dd
        className="mt-1 break-all font-mono font-semibold text-bp-graphite md:truncate md:break-normal"
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
