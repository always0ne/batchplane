import type { BatchChangeDraft } from "@batchplane/ui-client";
import type { useBatchChangeForm } from "../hooks/useBatchChangeForm";
import { BatchMetadataEditor } from "./BatchMetadataEditor";
import { DeleteChangeSummary } from "./DeleteChangeSummary";
import { GitHubBatchExecutionInput } from "./GitHubBatchExecutionInput";
import { BatchScheduleEditor } from "./schedules/BatchScheduleEditor";

export function BatchChangeFields({
  form,
  mode,
}: {
  form: ReturnType<typeof useBatchChangeForm>;
  mode: BatchChangeDraft["mode"];
}) {
  if (mode === "delete") {
    return (
      <DeleteChangeSummary
        batchId={form.values.batchId}
        name={form.values.name}
        scheduleCount={form.draft.schedules.length}
      />
    );
  }

  return (
    <>
      <BatchMetadataEditor
        batchIdReadOnly={mode === "change"}
        onOwnerBlur={form.resolveOwnerDefault}
        onValueChange={form.updateValue}
        values={form.values}
      />
      <GitHubBatchExecutionInput
        onChange={form.setExecution}
        onFileChange={form.selectArtifact}
        value={form.execution}
      />
      <BatchScheduleEditor
        drafts={form.scheduleDrafts}
        onAdd={form.addSchedule}
        onRemove={form.removeSchedule}
        onRestore={form.restoreSchedule}
        onUpdate={form.updateSchedule}
      />
    </>
  );
}
