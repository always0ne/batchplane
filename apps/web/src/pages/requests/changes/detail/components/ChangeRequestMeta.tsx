export function ChangeRequestMeta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs text-bp-graphite">
        {value || "-"}
      </dd>
    </div>
  );
}
