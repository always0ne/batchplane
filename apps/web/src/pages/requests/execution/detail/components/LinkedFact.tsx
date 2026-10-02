import { Link } from "react-router";

export function LinkedFact({
  label,
  to,
  value,
}: {
  label: string;
  to: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
        {label}
      </dt>
      <dd className="mt-1 min-w-0">
        <Link
          className="break-all font-mono text-xs font-semibold text-bp-control underline"
          to={to}
        >
          {value}
        </Link>
      </dd>
    </div>
  );
}
