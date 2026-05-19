# GitHub Lite Technical Spec

This document captures implementation contracts for GitHub Lite.

## Repository Layout

Governance records live in the target GitHub repository:

```text
.batch-governance/
  batches/
    {batchId}.yml
    {batchId}/
      artifacts/
        {uploadedExecutionFile}
  schedules/
    {scheduleId}.yml
.github/
  workflows/
    {batchId}.yml
    batchtrail-dispatcher.yml
```

`{batchId}` paths must be derived from the submitted Batch ID. The application
must not persist placeholder paths such as `new-batch.yml`.

## Installation Flow

GitHub Lite is installed into a target repository by a setup pull request. The
browser UI creates the setup branch and pull request; a repository maintainer
reviews and merges it through GitHub. BatchTrail execution control starts after
that installation PR is merged.

The setup flow checks these required files on the default branch:

```text
.github/workflows/batchtrail-dispatcher.yml
.batch-governance/README.md
.batch-governance/batches/.gitkeep
.batch-governance/schedules/.gitkeep
```

If one or more files are missing, the UI may create a branch named:

```text
batchtrail/install/repo-mode-{yyyyMMddHHmmss}
```

and open a pull request titled:

```text
Install BatchTrail Repo Mode
```

The browser UI must not directly write installation files to the default branch.
It must create a pull request so the repository's native review and merge rules
remain the source of trust for bootstrap.

## Batch Definition

The batch definition is serialized as deterministic YAML:

```yaml
apiVersion: batchtrail.io/v1
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

The generated workflow has two jobs:

- `batchtrail-gate`
- `run-batch`

`run-batch` must declare `needs: batchtrail-gate`.

The workflow is invoked only by `workflow_dispatch` with these inputs:

```yaml
request_id:
  required: true
batch_id:
  required: true
request_digest:
  required: true
```

The batch job runs on the selected runner label and then executes the Batch
command. Uploaded execution files are committed as repository artifacts and are
available after checkout.

The Gate action must deny direct GitHub Actions reruns by default. When
`GITHUB_RUN_ATTEMPT` is greater than `1`, Gate returns
`RERUN_NOT_AUTHORIZED`. Retrying a governed batch requires a new BatchTrail
execution request or a future explicit retry-approval flow.

The Gate action must not trust `workflow_dispatch` inputs alone. The generated
workflow passes `github-token: ${{ secrets.GITHUB_TOKEN }}` to Gate. Gate uses
that token with `issues: read` permission to verify:

- the current workflow actor is the dispatcher automation actor
  (`github-actions[bot]` by default)
- a GitHub Issue contains a `batchtrail:execution-request` marker for the
  submitted `request_id`
- the Issue marker matches `batch_id`, `request_digest`, and `REQUESTED` status
- at least one Issue comment starts with `/bgcp approve ` and contains a
  matching `batchtrail:execution-approval` marker with `decision=APPROVED`

## Execution Request Payload

Manual request payload:

```json
{
  "apiVersion": "batchtrail.io/v1",
  "kind": "ExecutionRequest",
  "metadata": {
    "requestId": "btr-20260509010203-payment.daily-close-abcdef12",
    "batchId": "payment.daily-close"
  },
  "spec": {
    "requestedBy": "developer",
    "requestedAt": "2026-05-09T01:02:03.000Z",
    "expiresAt": "2026-05-09T02:02:03.000Z",
    "reason": "Manual request from BatchTrail Repo Mode.",
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
<!-- batchtrail:execution-approval
decision=APPROVED
requestId=...
batchId=...
requestDigest=...
-->
```

The dispatcher must verify:

- command is `approve` or approved retry command
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

The target repository needs a dispatcher workflow that listens to approval
comments and invokes `actions/dispatcher`.

Minimum dispatcher workflow:

```yaml
name: BatchTrail Dispatcher

on:
  issue_comment:
    types: [created]

permissions:
  actions: write
  contents: read
  issues: write

concurrency:
  group: batchtrail-dispatch-${{ github.event.issue.number }}
  cancel-in-progress: false

jobs:
  dispatch-approved-request:
    if: startsWith(github.event.comment.body, '/bgcp approve ')
    runs-on: ubuntu-latest
    steps:
      - name: Dispatch approved BatchTrail execution
        uses: always0ne/batchtrail/actions/dispatcher@main
        with:
          issue-number: ${{ github.event.issue.number }}
          comment-id: ${{ github.event.comment.id }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

The browser UI must not directly dispatch governed batch workflows in Lite mode.

The dispatcher workflow is responsible for:

- reading the triggering issue comment
- reading the execution request issue body
- verifying BatchTrail evidence
- serializing dispatch attempts for the same execution request issue
- ignoring requests that already have `batchtrail:dispatching` or
  `batchtrail:dispatched` state evidence
- calling the target workflow with:
  - `request_id`
  - `batch_id`
  - `request_digest`
- writing dispatch success or failure evidence

The dispatcher writes state evidence as Issue labels and comments:

- `batchtrail:dispatching` with a `DISPATCHING` `batchtrail:bgcp:dispatcher`
  marker before `workflow_dispatch`
- `batchtrail:dispatched` with a `DISPATCHED` `batchtrail:bgcp:dispatcher`
  marker after `workflow_dispatch` succeeds
- `batchtrail:dispatch-failed` with a `DISPATCH_FAILED`
  `batchtrail:bgcp:dispatcher` marker when dispatch fails

Duplicate approval comments for the same request ID, Batch ID, and request
digest must not create a second `workflow_dispatch` call once `DISPATCHING` or
`DISPATCHED` evidence exists.

Until this dispatcher workflow is installed in the target repository, approving
an execution request records approval evidence but does not execute the batch.

## Schedule Occurrence Contract

Schedule definitions are approved by PR and stored under:

```text
.batch-governance/schedules/{scheduleId}.yml
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
      "definitionPath": ".batch-governance/schedules/payment.daily-close.weekday-0900.yml",
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
