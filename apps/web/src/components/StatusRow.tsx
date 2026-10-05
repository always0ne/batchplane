export function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 rounded-md bg-slate-50 px-3 py-2">
      <dt className="min-w-0 font-medium text-bp-muted">{label}</dt>
      <dd className="min-w-0 break-normal text-right font-semibold text-bp-graphite [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}
