export function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/70 px-3 py-2 ring-1 ring-slate-100">
      <dt className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-xs font-semibold leading-relaxed text-bp-graphite [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}
