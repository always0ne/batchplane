export function SelectField({
  label,
  onChange,
  optionLabel = (option) => option,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  optionLabel?: (option: string) => string;
  options: readonly string[];
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-bp-graphite">
      {label}
      <select
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-bp-graphite"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
