# GitHub Lite SRS

This document defines the implementation requirements for BatchPlane GitHub
Lite mode. GitHub Lite is the Git-backed, serverless-first runtime used before
the installable control-plane implementation.

## Scope

GitHub Lite uses a GitHub repository as the governance store and audit surface.
The React/Vite UI runs without a BatchPlane server and calls GitHub APIs with a
user-provided token stored only in session storage.

GitHub Lite must support:

- Repository installation through a setup pull request.
- Batch registration through pull requests.
- Registration approval through the approvals inbox.
- Execution requests through GitHub Issues.
- Execution approval evidence through GitHub Issue comments.
- Dispatcher handoff through a repository workflow.
- BatchPlane Gate enforcement before any batch command runs.
- Future schedule execution through occurrence-level execution requests.

UI work must also follow the Lite UX baseline in
[`lite-ui-ux-baseline.md`](./lite-ui-ux-baseline.md). Screen-level
implementation is not complete until the user can understand the controlled
object, the next action, and whether the visible item is approval work,
execution evidence, or failure follow-up.

## Installation Requirements

The setup screen must inspect the connected repository before users rely on
execution approval.

Installation status is based on the default branch containing:

- `.github/workflows/batchplane-dispatcher.yml`
- `.batch-governance/README.md`
- `.batch-governance/batches/.gitkeep`
- `.batch-governance/schedules/.gitkeep`

If required files are missing, the UI must offer an installation pull request.
The UI must create a setup branch and PR, not write directly to the default
branch. A repository maintainer reviews and merges the setup PR using GitHub's
native permission model.

The dispatcher workflow installed by the setup PR must listen to
`issue_comment.created`, filter comments that start with `/bgcp approve `, and
invoke `always0ne/batchplane/actions/dispatcher@main` with the triggering issue
number, comment ID, and repository `GITHUB_TOKEN`. It must serialize runs per
execution request Issue using workflow `concurrency` so duplicate approval
comments cannot dispatch the same request in parallel.

New generated workflows must use the renamed action repository reference
`always0ne/batchplane`. Legacy target repositories that still reference
`always0ne/batchtrail` rely on GitHub repository redirects until they regenerate
their setup artifacts.

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

- `run-name` containing the Batch ID and request ID so GitHub Actions runs can
  be correlated back to the BatchPlane execution request.
- `workflow_dispatch` inputs for `request_id`, `batch_id`, and
  `request_digest`.
- A `batchplane-gate` job before the batch job.
- A batch job that depends on `batchplane-gate`.
- Checkout before running repository-registered execution assets.
- The user-defined batch command after Gate.

`gateRequired` is an invariant. It is not an optional checkbox.

The Gate must deny GitHub Actions UI reruns by default. A rerun reuses the
original `workflow_dispatch` inputs, so it is not treated as a new BatchPlane
authorization. A retry must be represented by a new execution request or by a
future explicit retry approval.

The Gate must also verify GitHub evidence independently. The generated workflow
passes the repository `GITHUB_TOKEN` to Gate, and Gate must confirm that the
workflow run was initiated by the dispatcher automation and that a matching
execution request Issue plus APPROVED approval comment exist for the submitted
`request_id`, `batch_id`, and `request_digest`.

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

### Registration Review UX

Before creating the registration pull request, the UI must show a PR review
panel with:

- generated file paths for the batch definition, workflow, and optional
  execution file
- a governance checklist confirming Batch ID-derived paths, mandatory Gate,
  selected execution environment, and recorded Batch command
- a YAML preview for the batch definition and generated workflow
- a short handoff note that creation routes the PR to approvals and GitHub list
  results can lag briefly

The review panel is the primary operator surface. YAML preview is supporting
evidence, not the first thing the user should have to interpret.

## Execution Request Requirements

Manual execution starts from a registered active batch.

Creating an execution request must:

- Build a canonical `ExecutionRequest` payload.
- Compute a SHA-256 request digest over the canonical payload.
- Create a GitHub Issue with a BatchPlane execution request marker.
- Route the UI to the approvals inbox after creation.

The execution request UI must route users through a request form before Issue
creation. Batch list and batch detail actions must not directly create a request
with hidden defaults.

The request payload includes:

- `requestId`
- `batchId`
- requester and request timestamps
- expiration timestamp
- requested workflow ref
- request reason
- non-sensitive parameters
- sensitive parameter value digests only
- batch summary fields
- workflow path and ref

Sensitive parameter values must not be written to the GitHub Issue body,
canonical payload, browser storage, or handoff state. The UI may keep the value
only in transient form state before submission and must show that only the value
digest is persisted.

The request digest prevents approval evidence from being replayed against a
different payload.

Execution requests must carry enough context for approval judgment, including
the reason, workflow path/ref, runner label, batch command, and Gate-required
status. The digest is audit evidence; the UI must not make approvers rely on the
digest as the primary decision material.

## Approval Requirements

Execution approval happens in the approvals inbox.

The approvals inbox must contain only approval-actionable requests. Failed,
Gate-blocked, dispatching, dispatched, and rejected execution requests are
execution evidence or follow-up work, not approval work, and must not be shown
with approve/reject controls.

Each execution request must also have a BatchPlane detail screen. The detail
screen must show request status, requester, batch, environment, workflow
path/ref, runner, batch command, request digest, governance checks, canonical
request payload, approval evidence, dispatcher evidence, and Gate evidence when
available. The detail screen is the primary place to explain why approval did or
did not lead to dispatch.

Approved or dispatched execution requests must link to correlated GitHub
Actions runs when available. The execution run detail screen must show the run
status, external GitHub Actions link, workflow path/name, run attempt, actor,
request ID, Batch ID, Gate decision, and job conclusion summary. Gate-blocked
execution must be visually separated from business command failure: a blocked
Gate means the batch command did not run, while a failed batch job means Gate
allowed the run and the downstream command or business job failed.
Execution detail must also provide a path to native runner logs, at minimum by
linking each run/job to GitHub Actions. Inline log viewing is a follow-up
feature and must handle large logs, token permissions, and secret-bearing text
without persisting raw log content into audit evidence by default.

The execution run list screen is the primary run-history surface. It must show
recent GitHub Actions workflow_dispatch runs, including queued/running,
succeeded, business failed, canceled, and Gate-blocked runs. Each row must show
Batch ID, request ID, workflow path, completion state, GitHub Actions link, and
an execution run detail link. Filters must let operators inspect all runs,
active runs, successful runs, business failures, Gate blocks, or canceled runs.

The failure list or failure-focused shortcut must be implemented as a
follow-up view over execution run history, not as a replacement for the
execution run list. It must distinguish Gate blocks from business failures and
route rows to execution run detail. Business failure rows must support audit
follow-up/explanation separately from approval work. A failure explanation must
capture explanation text, action taken, owner, follow-up status, author,
timestamp, and related run/request IDs. In GitHub Lite this explanation must be
stored as immutable GitHub-backed evidence, such as structured Issue comments
or repository evidence files.

Registration pull requests must also have a BatchPlane detail screen reachable
from the approvals inbox. The registration detail screen must show pull request
metadata, review state, governance checklist, YAML change summary for governed
files, refresh action, and GitHub pull request link. Approval wording on this
screen must be explicit that approval merges the registration pull request.
Registration approve/reject actions are executed from this detail screen, not
directly from the approvals list card.

Approving an execution request must write an approval comment that starts with:

```text
/bgcp approve requestDigest={requestDigest}
```

The same comment must also include BatchPlane approval evidence with:

- decision
- approver
- approved timestamp
- `requestId`
- `batchId`
- `requestDigest`

The dispatcher workflow uses the command line as the trigger signal and the
BatchPlane marker as verification evidence.

The UI must not close the execution request Issue on approval. Approval is an
intermediate evidence state; dispatcher and Gate evidence must still be able to
attach to the same request Issue.

Rejecting an execution request must require a reason and write a rejection
comment containing the rejector, rejected timestamp, request ID, batch ID,
request digest, and rejection reason.

Self-approval must be blocked in the UI. The requester may see the request
detail, but the approval button must be disabled with an explicit reason when
the current GitHub user is also the requester.

If the target repository does not have the BatchPlane dispatcher workflow
installed, approval records evidence but cannot dispatch the batch workflow.
This must be treated as an installation/bootstrap gap, not as authorization to
dispatch directly from the browser.

The dispatcher must record dispatch state on the execution request Issue before
and after `workflow_dispatch`:

- `DISPATCHING` evidence and `batchplane:dispatching` label before dispatch
- `DISPATCHED` evidence and `batchplane:dispatched` label after success
- `DISPATCH_FAILED` evidence and `batchplane:dispatch-failed` label after
  failure

The dispatcher must ignore duplicate approval comments when matching
`DISPATCHING` or `DISPATCHED` evidence already exists for the same request ID,
Batch ID, and request digest.

Readers must continue to accept legacy `batchtrail.io/v1`, `batchtrail:*`
markers, and `batchtrail:*` labels so existing Lite repositories remain
auditable after the BatchPlane rebrand.

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
