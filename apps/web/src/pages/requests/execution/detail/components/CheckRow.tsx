import { CheckCircle2, XCircle } from "lucide-react";

export function CheckRow({ ok, text }: { ok: boolean; text: string }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <li
      className={`flex min-w-0 items-start gap-2 ${ok ? "text-bp-graphite" : "text-red-800"}`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${ok ? "text-emerald-700" : "text-red-700"}`}
        aria-hidden="true"
      />
      <span className="break-words font-semibold">{text}</span>
    </li>
  );
}
