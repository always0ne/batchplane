export function ApprovalMeta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}
