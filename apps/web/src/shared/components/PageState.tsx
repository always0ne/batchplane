import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

type PageStateTone = "danger" | "neutral";

type PageStateProps = {
  action?: ReactNode;
  icon?: ReactNode;
  message: ReactNode;
  title?: string;
  tone?: PageStateTone;
};

export function PageState({
  action,
  icon,
  message,
  title,
  tone = "neutral",
}: PageStateProps) {
  const toneClassName =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-slate-200 bg-white text-bt-muted";
  const iconClassName = tone === "danger" ? "text-red-700" : "text-bt-git";

  return (
    <div
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={`flex flex-wrap items-center gap-3 rounded-lg border p-5 text-sm font-semibold shadow-sm ${toneClassName}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      {icon ? <span className={iconClassName}>{icon}</span> : null}
      <div className="min-w-0 flex-1">
        {title ? (
          <p className="text-base font-bold text-bt-graphite">{title}</p>
        ) : null}
        <div className={title ? "mt-1" : undefined}>{message}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ message }: { message: ReactNode }) {
  return (
    <PageState
      icon={<Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
      message={message}
    />
  );
}

export function EmptyState({
  action,
  message,
}: {
  action?: ReactNode;
  message: ReactNode;
}) {
  return (
    <PageState
      action={action}
      icon={<Inbox className="h-5 w-5" aria-hidden="true" />}
      message={message}
    />
  );
}

export function ErrorState({ message }: { message: ReactNode }) {
  return (
    <PageState
      icon={<AlertCircle className="h-5 w-5" aria-hidden="true" />}
      message={message}
      tone="danger"
    />
  );
}
