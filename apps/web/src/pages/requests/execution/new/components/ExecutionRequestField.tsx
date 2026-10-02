import type { ReactNode } from "react";

export function ExecutionRequestField({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <label
      className={`block text-sm font-semibold text-bp-graphite ${className ?? ""}`}
    >
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}
