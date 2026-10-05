import type { BatchChangeDraft } from "@batchplane/ui-client";
import { useSearchParams } from "react-router";
import { BatchRegistrationLoadBoundary } from "./components/BatchRegistrationLoadBoundary";

export function BatchRegistrationPage() {
  const [searchParams] = useSearchParams();
  const changeBatchId = searchParams.get("change")?.trim() ?? "";
  const deleteBatchId = searchParams.get("delete")?.trim() ?? "";
  let mode: BatchChangeDraft["mode"] = "create";
  if (deleteBatchId) {
    mode = "delete";
  } else if (changeBatchId) {
    mode = "change";
  }
  const targetBatchId = deleteBatchId || changeBatchId;

  return (
    <BatchRegistrationLoadBoundary
      key={`${mode}:${targetBatchId}`}
      mode={mode}
      targetBatchId={targetBatchId}
    />
  );
}
