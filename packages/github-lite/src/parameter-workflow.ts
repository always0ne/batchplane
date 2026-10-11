import type { GitHubBatchDefinition } from "./github-batch-definition.js";
import {
  getNativeScheduleWorkflowJobIdentity,
  inputPreparationActionRef,
  parameterEnvironmentExpression,
} from "./github-workflow.js";
import { parseRepositoryYaml } from "./repository-yaml.js";

/** Inspect executable bindings, not a comment claiming that inputs are supported. */
export function hasParameterDelivery(
  workflowYaml: string,
  batch: GitHubBatchDefinition,
): boolean {
  const parsed = parseRepositoryYaml(workflowYaml);
  if (!parsed.ok || !isRecord(parsed.value)) return false;
  const jobs = parsed.value.jobs;
  if (!isRecord(jobs)) return false;
  if (
    !hasBusinessInputBinding(jobs["run-batch"], {
      "batch-id": "${{ inputs.batch_id }}",
      "request-id": "${{ inputs.request_id }}",
      "request-digest": "${{ inputs.request_digest }}",
    })
  )
    return false;
  return (batch.schedules ?? [])
    .filter((schedule) => schedule.enabled)
    .every((schedule) => {
      const { controlJobId, businessJobId } =
        getNativeScheduleWorkflowJobIdentity(schedule);
      return hasBusinessInputBinding(jobs[businessJobId], {
        "batch-id": batch.batchId,
        "request-id": `\${{ needs.${controlJobId}.outputs.request-id }}`,
        "request-digest": `\${{ needs.${controlJobId}.outputs.request-digest }}`,
        "issue-number": `\${{ needs.${controlJobId}.outputs.issue-number }}`,
        "schedule-id": schedule.scheduleId,
      });
    });
}

function hasBusinessInputBinding(
  job: unknown,
  expectedInputs: Record<string, string>,
): boolean {
  if (!isRecord(job) || !Array.isArray(job.steps)) return false;
  const steps = job.steps.filter(isRecord);
  const preparationIndex = steps.findIndex(
    (step) => step.id === "prepare" && step.uses === inputPreparationActionRef,
  );
  const businessIndex = steps.findIndex((step) => step.name === "Run batch");
  if (preparationIndex < 0 || businessIndex <= preparationIndex) return false;
  const preparation = steps[preparationIndex]!;
  const business = steps[businessIndex]!;
  const requiredInputs = {
    ...expectedInputs,
    mode: "lite",
    "approval-source": "issue",
    "approval-ref": expectedInputs["request-id"],
    "github-token": "${{ secrets.GITHUB_TOKEN }}",
    "private-key": "${{ secrets.BATCHPLANE_INPUT_KEY }}",
  };
  const inputs = preparation.with;
  return (
    preparation["continue-on-error"] !== true &&
    business.env === parameterEnvironmentExpression &&
    isRecord(inputs) &&
    Object.entries(requiredInputs).every(
      ([name, value]) => inputs[name] === value,
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
