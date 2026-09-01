import type { BatchPlaneClient } from "@batchplane/ui-client";
import { createContext, useContext } from "react";

export const BatchPlaneClientContext = createContext<BatchPlaneClient | null>(
  null,
);

export function useBatchPlaneClient(): BatchPlaneClient {
  const client = useContext(BatchPlaneClientContext);

  if (!client) {
    throw new Error("BatchPlaneClientContext.Provider is required.");
  }

  return client;
}
