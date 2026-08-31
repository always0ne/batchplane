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
- `.github/workflows/batchplane-sample-target.yml`
- `.batch-governance/README.md`
- `.batch-governance/workspace.yml`
- `.batch-governance/policies/role-mapping.yml`
- `.batch-governance/batches/.gitkeep`

If required files are missing, the UI must offer an installation pull request.
The UI must create a setup branch and PR, not write directly to the default
branch. A repository maintainer reviews and merges the setup PR using GitHub's
native permission model.

If all required files exist but managed workflow files do not match the current
BatchPlane Lite templates, the Workspace screen must show the outdated workflow
paths and offer a workflow update pull request. Managed workflow files are:

- `.github/workflows/batchplane-dispatcher.yml`
- `.github/workflows/batchplane-sample-target.yml`

The update PR must write current canonical workflow files and remove legacy
BatchTrail workflow files when they are replaced. It must not overwrite
repository-owned policy/configuration files such as
`.batch-governance/workspace.yml` or
`.batch-governance/policies/role-mapping.yml`.

The dispatcher workflow installed by the setup PR must listen to
`issue_comment.created`, but its dispatcher job must run only for actionable
approval evidence comments. An actionable manual approval comment must:

- be on an Issue, not a Pull Request conversation
- be on an execution request Issue labeled `batchplane:execution-request`
  or the legacy `batchtrail:execution-request`
- start with `/bgcp approve requestDigest=`
- contain the `batchplane:execution-approval` marker
- contain an approved decision marker

Only then may the workflow invoke
`always0ne/batchplane/actions/dispatcher@main` with the triggering issue number,
comment ID, and repository `GITHUB_TOKEN`. Discussion comments, clarification
comments, change-request comments, and markerless command-looking comments must
be ignored. The dispatcher workflow must serialize runs per execution request
Issue using workflow `concurrency` so duplicate approval comments cannot
dispatch the same request in parallel.

This dispatcher workflow is for manual approvals. Scheduled occurrences do not
wait in the approval inbox. Their generated workflow job creates or reuses the
occurrence request, records delegated approval evidence, and then invokes
`actions/dispatcher` directly inside the same workflow run.

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

If schedules are enabled for the batch, the generated workflow must also
include:

- `on.schedule` entries derived from `BatchDefinition.schedules[]`
- generated GitHub Actions schedule cron values converted to UTC from the
  user-entered cron/timezone pair; BatchPlane metadata keeps the original
  timezone-aware schedule for audit and occurrence validation
- one scheduler job per enabled schedule
- job-level `concurrency` per schedule so duplicate cron deliveries do not
  create parallel occurrence requests
- `actions/schedule-request` before any dispatch attempt
- direct invocation of `actions/dispatcher` after delegated approval evidence
  exists

The scheduler job must never run the batch command directly.

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

Registration PR creation routes directly to the returned PR detail page. The
approvals inbox may still lag behind GitHub list APIs, so newly created
registration, change, and deletion requests must remain reviewable through the
direct detail route immediately after creation.

The review panel is the primary operator surface. YAML preview is supporting
evidence, not the first thing the user should have to interpret.

### Batch Deletion Request Requirements

Batch deletion is a governed change request, not a direct repository mutation.
The batch detail screen must offer a delete request action in the same request
area as execution and change requests. Creating a delete request must open a
pull request titled `Delete batch {batchId}` and remove:

- `.batch-governance/batches/{batchId}.yml`
- the generated workflow path recorded in the batch definition
- the optional execution artifact path, when one is registered and present

The delete request body must preserve a deleted batch archive snapshot:

- request type `DELETE`
- Batch ID, name, owner, domain, environment, criticality
- workflow path, runner, command, optional execution file
- embedded schedules at deletion time
- source request number and URL through the PR itself

After the delete PR is merged, the batch no longer appears as an active
definition, but direct access to `/batches/{batchId}` must still show the
deleted batch archive and recent execution evidence when a merged delete request
exists. Execution request Issues and workflow run history must remain accessible
for deleted batches.

## Execution Request Requirements

Manual execution starts from a registered active batch.

Creating an execution request must:

- Build a canonical `ExecutionRequest` payload.
- Compute a SHA-256 request digest over the canonical payload.
- Create a GitHub Issue with a BatchPlane execution request marker.
- Route the UI to the approvals inbox after creation.
- Store the returned Issue in browser session handoff state until the approvals
  inbox observes the Issue from GitHub list APIs or the approval action removes
  it.

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

The Workspace approval mode is repository-backed configuration, not browser
local state. The policy file path is:

```text
.batch-governance/workspace.yml
```

If the file is missing, the effective approval mode is `SELF_APPROVAL_BLOCKED`.
`SELF_APPROVAL_BLOCKED` is the default four-eyes mode: requester and approver
must be different users. `SELF_APPROVAL_ALLOWED` is an explicit Workspace
policy choice for personal testing, demos, or low-risk automation where the
same operator may request and approve. In that mode, the approval comment must
make self-approval explicit and Gate must still verify approval evidence, batch
definition, dispatcher actor, request digest, and approver authorization.
`AUTO_APPROVE` is an explicit Workspace policy choice. In this mode, manual
execution request creation must also create auditable approval evidence with an
auto-approval source/type and `approvalMode=AUTO_APPROVE`. Gate must allow that
evidence only when the merged Workspace policy is `AUTO_APPROVE`. The dispatcher
workflow must remain responsible for `workflow_dispatch`. `AUTO_APPROVE` is a
higher permission level than `SELF_APPROVAL_ALLOWED`, so manual self-approval is
also allowed under this mode.

For failure follow-up evidence, both `SELF_APPROVAL_ALLOWED` and `AUTO_APPROVE`
also permit a current `maintain` or `admin` user to manually review their own
follow-up. This does not synthesize a post-failure review decision: even in
`AUTO_APPROVE`, the manager must submit an explicit review comment with one of
the terminal decisions and a nonblank reason.

The Workspace screen must allow an operator to prepare a Workspace policy
change without editing YAML by hand. Saving an approval mode change creates a
pull request that updates `.batch-governance/workspace.yml`; the effective mode
changes only after that pull request is merged. The screen must not use
browser-local settings to weaken approval policy.
The UI must explain the audit tradeoff plainly: relaxed modes reduce separation
of duties but do not remove request, approval, dispatcher, Gate, and run-history
evidence.

The approvals inbox must contain only approval-actionable requests. Failed,
Gate-blocked, dispatching, dispatched, and rejected execution requests are
execution evidence or follow-up work, not approval work, and must not be shown
with approve/reject controls.

The My Work screen must aggregate work connected to the current GitHub user:
registration requests authored by the user, registration review items awaiting
another maintainer, execution requests authored by the user, execution approval
items awaiting review, and failed or Gate-blocked runs that require follow-up.
Every row must route to the relevant BatchPlane detail screen rather than only
to a raw GitHub page.

Failure follow-up routing is stateful. If no valid follow-up exists, the
execution requester receives `Write follow-up` for a business failure. A
Gate-blocked run with no follow-up remains `Gate blocked` evidence work and
routes its requester to `Review evidence`; it must not claim that a business
failure explanation is missing because the batch command never ran. A follow-up in
`AWAITING_REVIEW` is review work only for a Runtime-eligible Workspace manager;
the requester must not receive a false missing-evidence item merely because
they requested the run. `APPROVED` clears follow-up work for its author and
requester. `CHANGES_REQUESTED` and `REJECTED` route the follow-up author or
owner to `Submit follow-up update` at the execution detail follow-up anchor.
An `OPEN` or `INVESTIGATING` follow-up may remain assigned as `Continue
follow-up`, but must not duplicate an eligible manager's review item for the
same record. Gate-block follow-ups preserve the `Gate blocked` label and Gate
context for ongoing work; Gate revisions may use the same update action as
business-failure revisions while retaining that label.

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
linking each Gate and business job to its native GitHub Actions job page when
GitHub returns job URLs. Permission failures must tell the operator that
Actions read permission is required. Inline log viewing must fetch logs only on
demand, limit rendered output, support search and download, and avoid
persisting raw log content into audit evidence by default. Business job logs
must default to the explicit `BatchPlane batch command` runner group emitted by
generated workflows and provide a full-log toggle for operator troubleshooting.

The execution run list screen is the primary run-history surface. It must show
recent GitHub Actions workflow_dispatch runs, including queued/running,
succeeded, business failed, canceled, and Gate-blocked runs. Each row must show
Batch ID, request ID, workflow path, completion state, GitHub Actions link, and
an execution run detail link. Filters must let operators inspect all runs,
active runs, successful runs, business failures, Gate blocks, or canceled runs.

The failure list must be implemented as a dedicated follow-up view over
execution run history, not as approval work. It must distinguish Gate blocks
from business failures and route rows to execution run detail. Business failure
rows must support audit follow-up/explanation separately from approval work. A
failure explanation must capture explanation text, action taken, owner,
follow-up status, author, timestamp, and related run/request IDs. In GitHub
Lite this explanation must be stored as GitHub-backed evidence, such as
structured Issue comments or repository evidence files. Final closure of a
failure explanation requires a Workspace manager review/approval workflow. A
review record is accepted only when its actual GitHub comment author currently
has `maintain` or `admin` repository permission; marker text cannot supply the
reviewer identity or timestamp. Operational follow-up status (`OPEN`,
`INVESTIGATING`, `RESOLVED`, or `ACCEPTED_RISK`) is independent from review
status (`AWAITING_REVIEW`, `APPROVED`, `CHANGES_REQUESTED`, or `REJECTED`). Each
of the three terminal review decisions requires a nonblank reason. Under the
default `SELF_APPROVAL_BLOCKED` policy, the author cannot review their own
follow-up; `SELF_APPROVAL_ALLOWED` and `AUTO_APPROVE` explicitly permit a
manager's manual self-review. `AUTO_APPROVE` does not create a post-failure
review decision automatically: the manager must still write an explicit review
comment with a nonblank reason.
For a request Issue, a follow-up marker is eligible only when its `requestId`
and `batchId` match the containing execution request. The first valid base
comment for each `followUpId` is authoritative, and only the first valid
terminal review for that base record affects its state. Detail screens show
ineligible review state as a compact reason/tooltip, not an apparently usable
decision control. GitHub comments remain editable or deletable under GitHub's
own permissions, and Lite has no trusted cross-client transaction lock, so it
presents repository-backed evidence rather than claiming an independent
immutable audit store.

Registration pull requests must also have a BatchPlane detail screen reachable
from the approvals inbox. The registration detail screen must show pull request
metadata, review state, governance checklist, YAML change summary for governed
files, refresh action, and GitHub pull request link. Approval wording on this
screen must be explicit that approval merges the registration pull request.
Registration approve/reject actions are executed from this detail screen, not
directly from the approvals list card.

The Audit Trail screen must render GitHub-backed audit events as one timeline.
The first Lite implementation must include registration pull request evidence,
execution request Issues, approval comments, dispatcher comments, Gate decision
comments, and workflow_dispatch run records. The timeline must support filtering
by Batch ID and request ID and show GitHub source links for each event when the
source URL is available.

Approving an execution request must write an approval comment that starts with:

```text
/bgcp approve requestDigest={requestDigest}
```

The same comment must also include BatchPlane approval evidence with:

- decision
- approver
- approved timestamp
- Workspace approval mode when available
- explicit self-approval marker when requester and approver are the same user
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

An explicit `retry-dispatch` comment may reuse the existing approval evidence
only when the latest matching dispatcher state is `DISPATCH_FAILED`.

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

Scheduled occurrence requests must not appear in the manual approval inbox.
They are auditable execution records, not human approval tasks.

The latest request status may be used for idempotency, overlap prevention,
retry, and skip policy. It must not be used as authorization for a new
occurrence.

## Audit Requirements

Each execution occurrence, manual or scheduled, must have its own request and
approval evidence.

For scheduled runs, issue volume is acceptable in GitHub Lite. Closed Issues
serve as the GitHub-backed audit log. Control Plane may later store the same
events in a database.
