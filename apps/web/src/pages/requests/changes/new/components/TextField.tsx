export function TextField({
  disabled = false,
  label,
  onChange,
  onBlur,
  placeholder,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-bp-graphite">
      {label}
      <input
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-bp-graphite disabled:bg-slate-100"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}
