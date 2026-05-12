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
    "workflow": {
      "path": ".github/workflows/payment.daily-close.yml",
      "ref": "main"
    }
  }
}
```

The request digest is computed over the canonical JSON payload.

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

The browser UI must not directly dispatch governed batch workflows in Lite mode.

The dispatcher workflow is responsible for:

- reading the triggering issue comment
- reading the execution request issue body
- verifying BatchTrail evidence
- calling the target workflow with:
  - `request_id`
  - `batch_id`
  - `request_digest`
- writing dispatch success or failure evidence

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
