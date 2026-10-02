import { AlertCircle, CheckCircle2 } from "lucide-react";

export function CheckItem({ ready, text }: { ready: boolean; text: string }) {
  const Icon = ready ? CheckCircle2 : AlertCircle;
  return (
    <li
      className={`flex items-start gap-2 ${ready ? "text-bp-graphite" : "text-amber-800"}`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${ready ? "text-emerald-700" : "text-amber-700"}`}
        aria-hidden="true"
      />
      <span className="font-medium">{text}</span>
    </li>
  );
}
