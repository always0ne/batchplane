import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { PageState } from "./PageState";

export function ErrorState({ message }: { message: ReactNode }) {
  return (
    <PageState
      icon={<AlertCircle className="h-5 w-5" aria-hidden="true" />}
      message={message}
      tone="danger"
    />
  );
}
