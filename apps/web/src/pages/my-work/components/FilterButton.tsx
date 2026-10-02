export function FilterButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={[
        "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition",
        active
          ? "bg-bp-control text-white"
          : "text-bp-muted hover:bg-slate-100 hover:text-bp-graphite",
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      {label}
      <span
        className={[
          "rounded px-1.5 py-0.5 text-xs",
          active ? "bg-white/20" : "bg-slate-200 text-bp-graphite",
        ].join(" ")}
      >
        {count}
      </span>
    </button>
  );
}
