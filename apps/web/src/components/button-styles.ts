export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "default" | "compact";

const baseClassName =
  "inline-flex items-center gap-2 rounded-md text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bp-control focus-visible:ring-offset-2";
const variantClassNames: Record<ButtonVariant, string> = {
  primary:
    "bg-bp-control text-white disabled:cursor-not-allowed disabled:bg-slate-300",
  secondary:
    "border border-slate-300 bg-white text-bp-graphite disabled:cursor-not-allowed disabled:text-slate-400",
};
const sizeClassNames: Record<ButtonSize, string> = {
  compact: "px-3 py-2",
  default: "px-4 py-2",
};

export function getButtonClassName({
  className,
  size,
  variant,
}: {
  className?: string;
  size: ButtonSize;
  variant: ButtonVariant;
}): string {
  return [
    baseClassName,
    variantClassNames[variant],
    sizeClassNames[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
