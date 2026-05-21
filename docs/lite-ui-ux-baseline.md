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

- Setup shows repository connection and installation readiness.
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
  state, execution target, request actions, and recent evidence.
- Failure, run detail, my work, and audit screens are post-approval follow-up
  surfaces. They must not be collapsed into the approvals inbox.

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
- Self-approval must be disabled with an explicit reason, not silently hidden.

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

## PR Checklist

For every UI screen PR:

- State where the screen sits in the operator journey.
- Confirm that the next action is visually clear.
- Confirm that approval work is separated from failure or audit evidence.
- Confirm that mandatory Gate language is not shown as optional.
- Confirm English and Korean copy carry the same product meaning.
- Confirm detail screens include refresh controls and explicit action wording.
