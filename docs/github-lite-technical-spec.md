# GitHub Lite Technical Spec

This document captures implementation contracts for GitHub Lite.

## Repository Layout

Governance records live in the target GitHub repository:

```text
.batch-governance/
  workspace.yml
  batches/
    {batchId}.yml
    {batchId}/
      artifacts/
        {uploadedExecutionFile}
.github/
  workflows/
    {batchId}.yml
    batchplane-dispatcher.yml
```

`{batchId}` paths must be derived from the submitted Batch ID. The application
must not persist placeholder paths such as `new-batch.yml`.

## Installation Flow

GitHub Lite is installed into a target repository by a setup pull request. The
browser UI creates the setup branch and pull request; a repository maintainer
reviews and merges it through GitHub. BatchPlane execution control starts after
that installation PR is merged.

The setup flow checks these required files on the default branch:

```text
.github/workflows/batchplane-dispatcher.yml
.batch-governance/README.md
.batch-governance/workspace.yml
.batch-governance/batches/.gitkeep
```

For repositories installed before the rebrand, the setup status check also
recognizes `.github/workflows/batchtrail-dispatcher.yml` and
`.github/workflows/batchtrail-sample-target.yml` as legacy equivalents. The UI
must not create a second dispatcher workflow only because the legacy dispatcher
filename is present.

If one or more files are missing, the UI may create a branch named:

```text
batchplane/install/lite-{yyyyMMddHHmmss}
```

and open a pull request titled:

```text
Install BatchPlane Lite
```

The browser UI must not directly write installation files to the default branch.
It must create a pull request so the repository's native review and merge rules
remain the source of trust for bootstrap.

## Workspace Policy

Workspace approval behavior is controlled by repository evidence at:

```text
.batch-governance/workspace.yml
```

Default file:

```yaml
apiVersion: "batchplane.io/v1"
kind: "WorkspacePolicy"
metadata:
  id: "default"
spec:
  approval:
    mode: "SELF_APPROVAL_BLOCKED"
```

Supported `spec.approval.mode` values are:

- `SELF_APPROVAL_BLOCKED`: default. Requester and approver must be different users.
- `SELF_APPROVAL_ALLOWED`: requester may approve their own execution request.
  The approval remains explicit audit evidence and Gate still verifies
  authorization.
- `AUTO_APPROVE`: reserved for a separate auto-approval implementation.

If `.batch-governance/workspace.yml` is missing, UI and Gate must treat the
mode as `SELF_APPROVAL_BLOCKED`. UI-only local settings must not weaken approval policy,
because Gate must be able to enforce the same decision independently in GitHub
Actions.

The Workspace screen may expose approval mode as a selectable setting, but save
must create a pull request that updates `.batch-governance/workspace.yml`.
Merging that pull request is the policy activation step. `AUTO_APPROVE` must be
rendered as reserved or disabled until the separate auto-approval flow is
implemented.

## Batch Definition

The batch definition is serialized as deterministic YAML:

```yaml
apiVersion: batchplane.io/v1
kind: BatchDefinition
metadata:
  id: "payment.daily-close"
  name: "Daily Close"
spec:
  owner: "ops-team"
  domain: "payments"
  environment: "PROD"
  criticality: "HIGH"
  status: "ACTIVE"
  workflow:
    path: ".github/workflows/payment.daily-close.yml"
    ref: "main"
  gateRequired: true
```

`gateRequired` is always `true` for Lite-registered batches.

## Generated Batch Workflow

The generated workflow has:

- one schedule-occurrence job per enabled schedule
- `batchplane-gate`
- `run-batch`

`run-batch` must declare `needs: batchplane-gate`.

The workflow must set a run name that includes the Batch ID and request ID:

```yaml
run-name: BatchPlane ${{ inputs.batch_id }} ${{ inputs.request_id }}
```

The workflow is invoked only by `workflow_dispatch` with these inputs:

```yaml
request_id:
  required: true
batch_id:
  required: true
request_digest:
  required: true
```

If the batch definition contains enabled schedules, the generated workflow also
declares `on.schedule` and creates one scheduler job per enabled schedule. The
scheduler job must:

- run only on `github.event_name == 'schedule'`
- match its generated GitHub Actions UTC cron expression
- reject reruns with `github.run_attempt == 1`
- serialize by schedule-specific `concurrency` so duplicate GitHub cron
  deliveries cannot create parallel requests for the same schedule
- emit only generated UTC `cron` values in `on.schedule`; GitHub Actions
  schedule entries must not rely on non-standard timezone semantics
- pass the user-entered schedule `cron` and `timezone` to
  `actions/schedule-request` so occurrence validation, request evidence, and
  audit text remain timezone-aware
- call `always0ne/batchplane/actions/schedule-request@main`
- call `always0ne/batchplane/actions/dispatcher@main` directly when delegated
  approval evidence was created or reused

The scheduler job must not execute the batch command directly.

The batch job runs on the selected runner label and then executes the Batch
command. Uploaded execution files are committed as repository artifacts and are
available after checkout.

The Gate action must deny direct GitHub Actions reruns by default. When
`GITHUB_RUN_ATTEMPT` is greater than `1`, Gate returns
`RERUN_NOT_AUTHORIZED`. Retrying a governed batch requires a new BatchPlane
execution request or a future explicit retry-approval flow.

The Gate action must not trust `workflow_dispatch` inputs alone. The generated
workflow passes `github-token: ${{ secrets.GITHUB_TOKEN }}` to Gate. Gate uses
that token with `issues: read` permission to verify:

- the current workflow actor is the dispatcher automation actor
  (`github-actions[bot]` by default)
- a GitHub Issue contains a `batchplane:execution-request` marker for the
  submitted `request_id`
- the Issue marker matches `batch_id`, `request_digest`, and `REQUESTED` status
- at least one Issue comment starts with `/bgcp approve ` and contains a
  matching `batchplane:execution-approval` marker with `decision=APPROVED`

## Execution Request Payload

Manual request payload:

```json
{
  "apiVersion": "batchplane.io/v1",
  "kind": "ExecutionRequest",
  "metadata": {
    "requestId": "btr-20260509010203-payment.daily-close-abcdef12",
    "batchId": "payment.daily-close"
  },
  "spec": {
    "requestedBy": "developer",
    "requestedAt": "2026-05-09T01:02:03.000Z",
    "expiresAt": "2026-05-09T02:02:03.000Z",
    "reason": "Manual request from BatchPlane Lite.",
    "batch": {
      "name": "Daily Close",
      "owner": "ops-team",
      "domain": "payments",
      "environment": "PROD",
      "criticality": "HIGH"
    },
    "execution": {
      "runsOn": "ubuntu-latest",
      "command": "echo mock batch",
      "gateRequired": true
    },
    "workflow": {
      "path": ".github/workflows/payment.daily-close.yml",
      "ref": "main"
    }
  }
}
```

The request digest is computed over the canonical JSON payload.

The approval UI reads the canonical payload to show the approver what will run.
The execution context in the payload is therefore part of the approval evidence,
not merely display metadata.

## Approval Comment Contract

Execution approval comments must start with the dispatcher command:

```text
/bgcp approve requestDigest=sha256:...
```

The comment must also contain the structured marker:

```text
<!-- batchplane:execution-approval
decision=APPROVED
requestId=...
batchId=...
requestDigest=...
approvalMode=SELF_APPROVAL_ALLOWED
selfApproval=true
-->
```

`approvalMode` is emitted when the UI knows the effective Workspace policy.
`selfApproval=true` is emitted only when requester and approver are the same
user. Gate does not rely only on this marker; it reads
`.batch-governance/workspace.yml` and allows self-approval only when the
effective policy mode is `SELF_APPROVAL_ALLOWED`.

The dispatcher must verify:

- command is `approve` or approved retry command
- approval commands are actionable only when the triggering comment contains
  the `batchplane:execution-approval` marker and an approved decision
- request evidence exists
- approval evidence exists
- request status is `REQUESTED`
- request has not expired
- request and approval reference the same `requestId`
- request and approval reference the same `batchId`
- request and approval reference the same digest
- workflow path and ref are present

Only after those checks may the dispatcher call `workflow_dispatch`.

## Dispatcher Workflow Contract

The target repository needs a dispatcher workflow that listens to manual
approval comments and invokes `actions/dispatcher`.

Minimum dispatcher workflow:

```yaml
name: BatchPlane Dispatcher

on:
  issue_comment:
    types: [created]

permissions:
  actions: write
  contents: read
  issues: write

concurrency:
  group: batchplane-dispatch-${{ github.event.issue.number }}
  cancel-in-progress: false

jobs:
  dispatch-approved-request:
    if: >-
      github.event.issue.pull_request == null &&
      startsWith(github.event.comment.body, '/bgcp approve requestDigest=') &&
      contains(github.event.comment.body, '<!-- batchplane:execution-approval') &&
      contains(github.event.comment.body, 'decision=APPROVED') &&
      (contains(github.event.issue.labels.*.name, 'batchplane:execution-request') ||
       contains(github.event.issue.labels.*.name, 'batchtrail:execution-request'))
    runs-on: ubuntu-latest
    steps:
      - name: Dispatch approved BatchPlane execution
        uses: always0ne/batchplane/actions/dispatcher@main
        with:
          issue-number: ${{ github.event.issue.number }}
          comment-id: ${{ github.event.comment.id }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

`always0ne/batchplane` is the current action repository reference. Legacy
target repositories that still reference `always0ne/batchtrail` depend on
GitHub repository redirects until their setup artifacts are regenerated.

GitHub Actions still creates a workflow run for every `issue_comment.created`
event. The dispatcher job must be skipped for ordinary discussion comments,
Pull Request review comments, clarification comments, change-request comments,
and markerless command-looking comments. The dispatcher action also repeats the
actionable approval check and returns `IGNORED_COMMENT` without writing failure
evidence when the comment is not marker-backed approval evidence.

The browser UI must not directly dispatch governed batch workflows in Lite mode.
Scheduled occurrences also must not rely on `issue_comment.created` from
`github-actions[bot]`, because GitHub token-authored Issue comments are not a
reliable trigger source for a second workflow. Generated schedule jobs invoke
`actions/dispatcher` directly after they create or reuse delegated approval
evidence.

The dispatcher workflow is responsible for:

- reading the triggering issue comment
- reading the execution request issue body
- verifying BatchPlane evidence
- serializing dispatch attempts for the same execution request issue
- ignoring requests that already have `batchplane:dispatching` or
  `batchplane:dispatched` state evidence
- calling the target workflow with:
  - `request_id`
  - `batch_id`
  - `request_digest`
- writing dispatch success or failure evidence

The dispatcher writes state evidence as Issue labels and comments:

- `batchplane:dispatching` with a `DISPATCHING` `batchplane:bgcp:dispatcher`
  marker before `workflow_dispatch`
- `batchplane:dispatched` with a `DISPATCHED` `batchplane:bgcp:dispatcher`
  marker after `workflow_dispatch` succeeds
- `batchplane:dispatch-failed` with a `DISPATCH_FAILED`
  `batchplane:bgcp:dispatcher` marker when dispatch fails
- `retry-dispatch` comments may reuse the existing matching approval evidence
  only when the latest dispatcher state for that request is `DISPATCH_FAILED`

## Registration Approval Detail Contract

The registration approval detail screen reads registration pull requests from
the approvals queue and shows governed file change summaries.

For each governed path (batch definition, workflow, optional execution file),
the UI compares:

- base ref (`pullRequest.base`)
- registration branch ref (`pullRequest.head`)

and classifies each file as `ADDED`, `UPDATED`, `UNCHANGED`, or `MISSING_HEAD`.
`MISSING_HEAD` is rendered to users as a removed file when the pull request is a
delete request.

The screen must include:

- pull request metadata and link
- review state (open, approved pending merge, merged, rejected, closed)
- governance checklist
- file status summary and head revision preview
- refresh action

Delete requests use the same registration approval detail contract with request
type `DELETE`. The browser creates a branch from the target base branch, deletes
the batch definition and generated workflow, deletes the optional execution
artifact when present, and opens a pull request. If either the batch definition
or workflow is missing on the base branch, the browser must block the delete
request instead of creating a partial deletion request.

When a batch definition is no longer present on the default branch, the batch
detail route may recover a deleted batch archive by searching merged governed
change pull requests for a `DELETE` request matching the Batch ID. The archive is
read from the delete request body and must preserve enough fields to render the
deleted batch profile, workflow, runner, command, schedules, and source request.
Execution request Issues and workflow runs remain independent evidence and must
still be queryable by Batch ID.

Duplicate approval comments for the same request ID, Batch ID, and request
digest must not create a second `workflow_dispatch` call once `DISPATCHING` or
`DISPATCHED` evidence exists.

## Mutation Handoff And GitHub Lag

GitHub Lite treats mutation responses as authoritative immediate handoff
evidence. After the browser creates a registration PR or execution request
Issue, it stores the returned PR/Issue in `sessionStorage` and routes the user
to the approvals inbox. The approvals inbox merges this stored handoff with
GitHub list results, deduplicating by Issue or PR number.

The handoff entry is pruned when the corresponding GitHub list API returns the
same PR/Issue, or when the user completes an approval or rejection action. This
keeps the UI deterministic during GitHub API propagation without treating the
browser as the source of governance truth.

## Execution Run Detail Contract

The UI reads GitHub Actions run detail through the target repository API and
maps it into `ExecutionRun`:

- list workflows and workflow runs with `event=workflow_dispatch`
- when workflow lists are used for execution contexts, exclude workflows whose
  YAML does not declare `workflow_dispatch`
- read a specific workflow run by run ID
- read the workflow run jobs for Gate and business-job conclusions
- correlate runs to BatchPlane requests using the workflow run name/title,
  request ID, Batch ID, workflow path, and execution request evidence

Generated workflows must set:

```yaml
run-name: BatchPlane ${{ inputs.batch_id }} ${{ inputs.request_id }}
```

This makes the request correlation readable in GitHub Actions and recoverable
by the Lite UI even without a server-side database.

Run status mapping must distinguish control failure from business failure:

- Gate job failure before the batch job runs maps to `BLOCKED`.
- Gate success plus downstream batch job failure maps to `FAILED`.
- Completed successful jobs map to `SUCCEEDED`.
- In-progress GitHub run states map to `QUEUED` or `RUNNING`.
- Canceled/skipped runs map to `CANCELED` unless Gate evidence proves a
  control block.

The run detail screen must include an external GitHub Actions run link, a job
summary, and job-level links to native GitHub Actions logs when `html_url`
exists on the GitHub job response. Gate and business jobs must be labeled
separately so operators can inspect control logs before business logs.
Permission failures must use an actionable Actions-read-permission message
instead of a raw API error. Inline log viewing uses the GitHub job log endpoint
on demand, keeps raw log text in volatile UI state only, limits rendered output,
supports line filtering and download, and avoids storing raw logs as audit
evidence by default. GitHub job log downloads use short-lived redirect URLs and
may expose large or secret-bearing text, so the browser must treat the fetched
content as transient operator evidence. Business job log viewing defaults to
the explicit `BatchPlane batch command` runner group emitted inside the
generated `Run batch` step and offers an explicit full-log mode for
checkout/setup troubleshooting. Older workflows without the explicit group may
fall back to the generated `Run batch` step.

Failure follow-up is separate from approval. Business-failed runs must be able
to collect an explanation record with explanation text, action taken, owner,
follow-up status, author, timestamp, run ID, and request ID. GitHub Lite must
persist this as GitHub-backed evidence, such as structured Issue comments or
repository evidence files, so it remains auditable without a database. The
follow-up record is a submitted explanation, not final closure. Workspace
manager review decisions are a separate evidence type and workflow.

The Lite runtime exposes `audit.listAuditTimeline({ limit })` by composing
GitHub repository evidence rather than reading a database. The GitHub adapter
loads registration pull requests, execution request Issues and comments,
workflow_dispatch runs, and workflow metadata, then normalizes them into
`AuditTimelineItem` rows with optional `sourceUrl` values. UI filtering is
client-side for the first Lite implementation and uses normalized metadata keys
such as `batchId`, `requestId`, `runId`, `status`, and `reasonCode`.

The My Work screen is a UI aggregation over existing ports. It loads the
current GitHub user, registration pull requests, execution request Issues and
comments, and recent execution runs. Items are classified into approvals,
registrations, user requests, and failure follow-ups, then linked to the
corresponding BatchPlane detail route.

Parsers must accept both BatchPlane and legacy BatchTrail evidence namespaces:
`batchplane.io/v1` and `batchtrail.io/v1`, plus `batchplane:*` and
`batchtrail:*` hidden markers/labels. Writers emit BatchPlane identifiers.

Until this dispatcher workflow is installed in the target repository, approving
an execution request records approval evidence but does not execute the batch.

## Schedule Occurrence Contract

Schedules are approved by PR and stored inside the owning batch definition:

```text
.batch-governance/batches/{batchId}.yml
```

Every due occurrence creates or reuses one execution request issue keyed by:

```text
{scheduleId}:{scheduledAt}
```

Scheduled request payloads extend manual requests:

```json
{
  "spec": {
    "triggerType": "SCHEDULE",
    "schedule": {
      "scheduleId": "payment.daily-close.weekday-0900",
      "scheduledAt": "2026-05-13T00:00:00.000Z",
      "definitionPath": ".batch-governance/batches/payment.daily-close.yml",
      "definitionCommitSha": "..."
    }
  }
}
```

`scheduledAt` is part of the digest. A previous occurrence approval cannot be
reused for a later occurrence.

The scheduler may inspect the latest request for:

- duplicate request prevention
- overlap prevention
- retry decisions
- skip decisions

The scheduler must not use the latest request as authorization for a new
occurrence.

Scheduled occurrences do not enter the human approval inbox. The approved batch
definition is the approval source of truth; each occurrence writes delegated
approval evidence and then dispatches through the same dispatcher-plus-Gate
path used by manual requests.
