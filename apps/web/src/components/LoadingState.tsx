import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { PageState } from "./PageState";

export function LoadingState({ message }: { message: ReactNode }) {
  return (
    <PageState
      icon={<Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
      message={message}
    />
  );
}
