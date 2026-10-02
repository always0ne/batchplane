import type { ReactNode } from "react";

export function ApprovalSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-bp-graphite">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
