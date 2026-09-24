import { useMemo, type ReactNode } from "react";
import { BatchPlaneClientContext } from "../client/batch-plane-client-context";
import { createRuntimeBatchPlaneClient } from "../runtime/runtime-batch-plane-client";

export function RuntimeClientTestProvider({
  children,
  ...dependencies
}: Parameters<typeof createRuntimeBatchPlaneClient>[0] & {
  children: ReactNode;
}) {
  const { createClient, readSession } = dependencies;
  const client = useMemo(
    () => createRuntimeBatchPlaneClient({ createClient, readSession }),
    [createClient, readSession],
  );
  return (
    <BatchPlaneClientContext.Provider value={client}>
      {children}
    </BatchPlaneClientContext.Provider>
  );
}
