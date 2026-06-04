# Lite UI/UX Baseline

This document defines the UI/UX baseline for BatchPlane Lite screens.
Every screen PR should check its scope against this baseline before review.

## Operator Journey

Lite must read as one connected operational flow:

1. Connect a GitHub repository.
2. Install Lite through a setup pull request.
3. Register a batch through a pull request that includes the batch definition,
   generated workflow, and optional execution artifact.
4. Review and approve registration changes in the approvals inbox.
5. Request execution for an active, Gate-protected batch.
6. Review execution context and approve or reject the request.
7. Let the dispatcher invoke the governed workflow.
8. Review execution evidence, Gate decisions, failures, and audit history.

## Screen Responsibilities

- Workspace shows GitHub connection, installation readiness, and
  repository-backed Workspace policy changes.
- Registration shows what will be controlled, what will run, where it will run,
  and which files the pull request will create.
- Approvals shows only work that can still be approved or rejected.
- Registration approval detail shows PR metadata, review state, governance
  checklist, and YAML change summary before merge/reject.
- Execution request detail shows the full judgment record for one request:
  request status, requester, batch context, workflow/ref, runner, command,
  digest, canonical payload, approval evidence, dispatcher evidence, and Gate
  evidence.
- Batch list is the operator's inventory and should eventually include recent
  execution state, pending request count, and failure signals.
- Batch detail is the operator console for one batch. It must show control
  state, execution target, request actions, and recent evidence. When the active
  definition has been deleted through a governed delete request, the same route
  must render a deleted batch archive instead of a dead not-found screen, and it
  must keep recent execution evidence reachable for audit review.
- Failure, run detail, my work, and audit screens are post-approval follow-up
  surfaces. They must not be collapsed into the approvals inbox.
- My Work is the current user's work queue. It should compactly group approval
  work, the user's own registration and execution requests, and failure
  follow-up items, with each row linking to the relevant BatchPlane detail
  route.
- Audit Trail is the evidence timeline. It should show event type, actor, time,
  source link, and compact metadata, with Batch ID and request ID filters.
- Execution run list is the primary run-history surface. It must show normal,
  active, business failed, and Gate-blocked workflow runs before failure-only
  shortcuts are added.
- Failure list or failure shortcuts show only follow-up execution evidence.
  They must distinguish Gate blocks from business failures and route rows to
  execution run detail. Business failures must offer an explanation/follow-up
  action that records the operator's explanation, action taken, owner, status,
  author, timestamp, and related execution evidence. The UI must not imply that
  an operator explanation is final closure until a Workspace manager review
  approves it.
- Execution run detail must separate control evidence from business execution:
  Gate-blocked runs explain that the batch command did not run, while business
  failures explain that Gate allowed the run and the downstream command failed.
  The screen must include a GitHub Actions link, job conclusion summary, and a
  clear path to native runner logs for both Gate and business jobs. Inline log
  viewing must be on demand, searchable, bounded, downloadable, and clearly
  described as non-persisted raw text. Business logs should open on the batch
  command runner group first, with full-log mode available when setup or
  checkout evidence matters.

## Approval UX Rules

- Execution approvers must see judgment context before approving:
  - Batch ID and request ID
  - Requested by and expiration
  - Reason
  - Workflow path and ref
  - Runner label
  - Batch command
  - Gate-required status
- Request digest is audit evidence. It must be visible, but it is not the
  primary decision material.
- Failed, Gate-blocked, dispatching, dispatched, and rejected execution issues
  are not approval work. They must not be shown with approve/reject controls.
- Rejecting an execution request must require a reason.
- Self-approval must be disabled with an explicit reason unless the effective
  Workspace policy is `SELF_APPROVAL_ALLOWED`.

## Workspace Settings UX Rules

- The navigation label must use Workspace language, not Repo Settings.
- GitHub owner/repository fields are connection details inside the Workspace,
  not the product-level settings concept.
- Approval mode changes must create a pull request to
  `.batch-governance/workspace.yml`; the browser must not store approval policy
  as local UI state.
- `AUTO_APPROVE` may be visible as reserved future scope, but it must not be
  actionable until the auto-approval implementation exists.

## Gate UX Rules

- Gate is mandatory for Lite batches.
- UI must not present Gate as an optional feature or toggle.
- Gate copy should be compact and close to the action it protects.
- Non-compliant records may be displayed as evidence, but they cannot be
  requested for execution.

## GitHub Delegation UX Rules

- Creating a pull request or issue should route the user to the related
  BatchPlane work queue immediately.
- The UI should acknowledge that GitHub issue, pull request, and actions
  visibility can lag briefly after creation.
- Browser UI must not imply it directly dispatches governed workflows.
  Dispatch is performed by the repository dispatcher workflow after approval.
- GitHub Actions visibility can lag after dispatch. Run detail links should
  appear when correlation evidence is available, and missing runs should be
  presented as pending visibility rather than as proof that approval failed.

## PR Checklist

For every UI screen PR:

- State where the screen sits in the operator journey.
- Confirm that the next action is visually clear.
- Confirm that approval work is separated from failure or audit evidence.
- Confirm that mandatory Gate language is not shown as optional.
- Confirm English and Korean copy carry the same product meaning.
- Confirm detail screens include refresh controls and explicit action wording.
