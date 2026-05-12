# GitHub Lite SRS

This document defines the implementation requirements for BatchTrail GitHub
Lite mode. GitHub Lite is the Git-backed, serverless-first runtime used before
the installable control-plane implementation.

## Scope

GitHub Lite uses a GitHub repository as the governance store and audit surface.
The React/Vite UI runs without a BatchTrail server and calls GitHub APIs with a
user-provided token stored only in session storage.

GitHub Lite must support:

- Repository installation through a setup pull request.
- Batch registration through pull requests.
- Registration approval through the approvals inbox.
- Execution requests through GitHub Issues.
- Execution approval evidence through GitHub Issue comments.
- Dispatcher handoff through a repository workflow.
- BatchTrail Gate enforcement before any batch command runs.
- Future schedule execution through occurrence-level execution requests.

## Installation Requirements

The setup screen must inspect the connected repository before users rely on
execution approval.

Installation status is based on the default branch containing:

- `.github/workflows/batchtrail-dispatcher.yml`
- `.batch-governance/README.md`
- `.batch-governance/batches/.gitkeep`
- `.batch-governance/schedules/.gitkeep`

If required files are missing, the UI must offer an installation pull request.
The UI must create a setup branch and PR, not write directly to the default
branch. A repository maintainer reviews and merges the setup PR using GitHub's
native permission model.

The dispatcher workflow installed by the setup PR must listen to
`issue_comment.created`, filter comments that start with `/bgcp approve `, and
invoke `always0ne/batchtrail/actions/dispatcher@main` with the triggering issue
number, comment ID, and repository `GITHUB_TOKEN`.

## Registration Requirements

### Batch Definition

Registration creates `.batch-governance/batches/{batchId}.yml`.

The `batchId` is mandatory. The UI must not create fallback identifiers such as
`new-batch` for persistent governance paths.

### Workflow Generation

Registration creates `.github/workflows/{batchId}.yml` in the same pull request
as the batch definition.

The workflow path is derived from the Batch ID. Users must not directly choose a
different workflow path during the initial Lite registration flow.

The generated workflow must include:

- `workflow_dispatch` inputs for `request_id`, `batch_id`, and
  `request_digest`.
- A `batchtrail-gate` job before the batch job.
- A batch job that depends on `batchtrail-gate`.
- Checkout before running repository-registered execution assets.
- The user-defined batch command after Gate.

`gateRequired` is an invariant. It is not an optional checkbox.

### Execution Environment

Registration must let users select the batch execution environment.

The default choices are:

- `ubuntu-latest`
- `ubuntu-24.04`
- `windows-latest`
- `macos-latest`
- `self-hosted`

The UI must also support a custom runner label. Comma-separated custom labels
are serialized as a GitHub Actions runner label array, for example:

```yaml
runs-on: ["self-hosted", "linux", "prod"]
```

### Batch Command And Artifacts

The command field label is `Batch command` in English and `배치 명령` in Korean.

Users may either enter a command directly or upload an execution file. Uploaded
files are committed in the same registration pull request under:

```text
.batch-governance/batches/{batchId}/artifacts/{fileName}
```

If the command field is empty when a file is uploaded, the UI may populate a
default command that executes the uploaded artifact. The command must update if
it was auto-generated and the Batch ID changes.

## Execution Request Requirements

Manual execution starts from a registered active batch.

Creating an execution request must:

- Build a canonical `ExecutionRequest` payload.
- Compute a SHA-256 request digest over the canonical payload.
- Create a GitHub Issue with a BatchTrail execution request marker.
- Route the UI to the approvals inbox after creation.

The request payload includes:

- `requestId`
- `batchId`
- requester and request timestamps
- expiration timestamp
- batch summary fields
- workflow path and ref

The request digest prevents approval evidence from being replayed against a
different payload.

## Approval Requirements

Execution approval happens in the approvals inbox.

Approving an execution request must write an approval comment that starts with:

```text
/bgcp approve requestDigest={requestDigest}
```

The same comment must also include BatchTrail approval evidence with:

- decision
- approver
- approved timestamp
- `requestId`
- `batchId`
- `requestDigest`

The dispatcher workflow uses the command line as the trigger signal and the
BatchTrail marker as verification evidence.

If the target repository does not have the BatchTrail dispatcher workflow
installed, approval records evidence but cannot dispatch the batch workflow.
This must be treated as an installation/bootstrap gap, not as authorization to
dispatch directly from the browser.

## Schedule Requirements

Schedules do not directly execute batch workflows.

An approved schedule definition means:

> This batch may be requested for execution according to this recurrence
> policy.

For every due occurrence, the scheduler must create or reuse an execution
request identified by `scheduleId + scheduledAt`.

Each scheduled occurrence request must include:

- `triggerType: SCHEDULE`
- `scheduleId`
- `scheduledAt`
- approved schedule definition path
- approved schedule definition commit SHA
- current batch/workflow target
- occurrence-specific request digest

Automatic approval is allowed only when the request is derived from an approved
schedule definition. This is equivalent to delegated approval, not to skipping
approval.

The latest request status may be used for idempotency, overlap prevention,
retry, and skip policy. It must not be used as authorization for a new
occurrence.

## Audit Requirements

Each execution occurrence, manual or scheduled, must have its own request and
approval evidence.

For scheduled runs, issue volume is acceptable in GitHub Lite. Closed Issues
serve as the GitHub-backed audit log. Control Plane may later store the same
events in a database.
