import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { PageState } from "./PageState";

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
