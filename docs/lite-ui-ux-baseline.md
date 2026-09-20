# Lite UI/UX Baseline

## Platform Input Boundaries

Separating business metadata from platform execution settings must preserve the
operator's single Batch registration/change journey: one Page, one draft flow,
one preview and one governed request. A platform-specific input component is
not a second setup wizard. Existing command, runner/custom labels, execution
file, revision and schedule controls remain available, and Batch detail and
execution requests continue to show what will run and where. Shared surfaces
must not assume GitHub Actions is the only platform or decode workflow/YAML
data themselves. Use ordinary named React components and typed props rather
than a generic JSON form engine. No visual redesign is implied by this boundary.

This document defines the UI/UX baseline for BatchPlane Lite screens.
Every screen PR should check its scope against this baseline before review.

## Product Navigation

- Execution history, exact execution detail and failures use `/executions`,
  `/executions/:executionId` and `/executions/failures`. Settings use `/workspace`.
- Product navigation says Executions and Requests and audit (실행내역, 요청 및
  감사), not provider Run or Governance categories. Provider source links retain
  their actual provider names; do not disguise an external destination.
- Failure history belongs to execution inspection. Its navigation state must
  distinguish it from the all-execution list. Preserve direct entry, filters,
  exact scheduled occurrence/attempt links and existing follow-up/log access.
- This cleanup preserves the current My Work purpose and change/execution
  request creation/detail routes. It must not introduce a second request-writing
  journey or imply that unified requests are already available.
- [Unified requests](./unified-request-feature-spec.md) are a separate deferred
  feature; their complete writing/approval/item-processing UX is reviewed after
  refactoring, before that feature is implemented.

## Operator Journey

Lite must read as one connected operational flow:

1. Connect a Workspace backed by a GitHub repository.
2. Install Lite through a setup request.
3. Register a batch through a governed change request that includes the batch
   definition, generated workflow, and optional execution artifact.
4. Review and decide registration changes in the approvals inbox.
5. Request execution for an active, Gate-protected batch.
6. Review execution context and approve or reject the request.
7. Let the dispatcher invoke the governed workflow.
8. Review execution evidence, Gate decisions, failures, and audit history.

For scheduled execution, the approved Batch change authorizes unattended
occurrences. The native Run records its request, Gate and result in the same
workflow without per-run human approval or dispatcher handoff. Request detail
shows the schedule and original governed-revision authority, not a missing
approval. It links to the exact occurrence/attempt detail. See
[`schedule-execution-contract.md`](./schedule-execution-contract.md).

## Screen Responsibilities

- Workspace shows GitHub connection, installation readiness, and
  Workspace policy changes. If generated Workspace workflows
  are older than the current BatchPlane template, the screen must show the
  affected workflow paths and provide a pull-request action to update them.
- Registration shows what will be controlled, what will run, where it will run,
  and which governed files the request will change.
- Approvals shows only work that can still be approved or rejected. Scheduled
  occurrences never become manual approval tasks or counts, including while
  their Gate/result evidence is not yet available.
- Registration/change detail shows request status, external source metadata,
  control checklist, and YAML change summary before an internal decision.
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
- Batch list and detail show the adapter-projected revision-control state. Manual
  execution is unavailable for `BYPASSED` and `UNKNOWN` control with the compact
  reason on the disabled action. Detail shows only adapter-authorized remediation
  actions and sends the resulting governed change to its internal detail route;
  it never treats request creation as an automatic unlock.
- Failure, run detail, my work, and audit screens are post-approval follow-up
  surfaces. They must not be collapsed into the approvals inbox.
- My Work is the current user's work queue. It should compactly group approval
  work, the user's own registration and execution requests, and failure
  follow-up items, with each row linking to the relevant BatchPlane detail
  route. Failure routing is explicit: no valid business-failure follow-up gives
  the manual requester (or the scheduled execution revision's Batch owner)
  `Write follow-up`; a no-follow-up Gate block remains `Gate
blocked` evidence work with `Review evidence`, because the batch command did
  not run. `AWAITING_REVIEW` gives only an eligible manager review work;
  `APPROVED` clears author/requester follow-up work; and
  `CHANGES_REQUESTED` or `REJECTED` gives the author or owner `Submit
follow-up update`. An assigned `OPEN` or `INVESTIGATING` record may appear as
  `Continue follow-up`, but not alongside an incoherent duplicate review item
  for the same user and record. Gate-block revisions and ongoing records retain
  the `Gate blocked` label and Gate context.
- Audit Trail is the evidence timeline. It should show event type, actor, time,
  source link, and compact metadata, with Batch ID and request ID filters.
- Execution run list includes manual and native schedule executions. Multiple
  schedules within one platform Run retain distinct detail/log links and exact
  attempt results; one schedule's failure must not be copied to the others.
  The list is the primary run-history surface. It must show normal,
  active, business failed, and Gate-blocked workflow runs before failure-only
  shortcuts are added.
- Failure list or failure shortcuts show only follow-up execution evidence.
  They must distinguish Gate blocks from business failures and route rows to
  execution run detail. Business failures must offer an explanation/follow-up
  action that records the operator's explanation, action taken, owner, status,
  author, timestamp, and related execution evidence. The UI must not imply that
  an operator explanation is final closure until a Workspace manager review
  decision is recorded. Operational status (`OPEN`, `INVESTIGATING`,
  `RESOLVED`, `ACCEPTED_RISK`) and review status (`AWAITING_REVIEW`,
  `APPROVED`, `CHANGES_REQUESTED`, `REJECTED`) are shown separately. Review
  controls are shown only when the product client reports that the current actor is
  eligible; unavailable review affordances use a compact reason or tooltip
  rather than a large explanatory panel. Follow-up and review timestamps use
  the active locale's compact date/time format and fall back to the localized
  unknown value for empty or invalid evidence. Review reasons are mandatory for
  `APPROVED`, `CHANGES_REQUESTED`, and `REJECTED`.

- The Lite adapter accepts a follow-up only when its `requestId` and `batchId` match
  the containing execution request, retains the first valid base comment for a
  duplicate `followUpId`, and uses actual GitHub comment author/time plus
  current `admin`/`maintain` verification for review evidence. Default
  `SELF_APPROVAL_BLOCKED` prevents author self-review unless the Workspace
  policy explicitly allows it. `SELF_APPROVAL_ALLOWED` and `AUTO_APPROVE`
  permit an eligible manager's manual self-review, but `AUTO_APPROVE` must not
  make a post-failure decision appear automatically: an explicit review comment
  and nonblank reason remain required. GitHub comments may be edited or
  deleted, and Lite has no cross-client transaction lock; the UI must not
  present this repository-backed evidence as immutable.
- Execution run detail must separate control evidence from business execution:
  Gate-blocked runs explain that the batch command did not run, while business
  failures explain that Gate allowed the run and the downstream command failed.
  The screen must include a GitHub Actions link, job conclusion summary, and a
  clear path to native runner logs for both Gate and business jobs. Inline log
  viewing must be on demand, searchable, bounded, downloadable, and clearly
  described as non-persisted raw text. Business logs should open on the batch
  command runner group first, with full-log mode available when setup or
  checkout evidence matters.

## Inspection Continuity

Run, failure, audit, and Dashboard Pages consume product-client results. Provider
connection and evidence interpretation are adapter responsibilities, not
additional user steps or screen modes.

- Dashboard failure and approval shortcuts count the same eligible records as
  the destination lists. An unknown Gate result does not count as a verified
  business failure, and native scheduled occurrences do not create manual
  approval work.
- Refresh performs a new query. A query failure must remain distinguishable
  from a successful empty result; do not hide it through an invented empty list.
- Language changes preserve the selected route, filters, log view/search, and
  unsent explanation. They change presentation, not the execution being loaded.
- Switching execution or Workspace isolates in-flight work. A late query,
  log response, or completed follow-up command must not change the newly opened
  execution or present an unconfirmed decision as successful.
- Internal destinations retain the exact scheduled occurrence and attempt,
  including source-only and deleted-batch history. External source links remain
  secondary evidence access, not replacements for available product detail.
- Log text remains unchanged and downloadable. Business/full-log selection and
  search must remain usable at mobile widths without widening the page.

These checks preserve existing post-execution functionality. They do not imply
implementation of result synchronization, actual execution cancellation,
backfill, new review policy, or stronger evidence retention.

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
- Schedule authority, Gate decision and business outcome are separate facts.
  No scheduled approval/dispatcher placeholder should imply that a person must
  act. Unknown nominal time or result must not be filled with an observed time,
  a fabricated success, or a false business failure.
- Failed, Gate-blocked, dispatching, dispatched, and rejected execution issues
  are not approval work. They must not be shown with approve/reject controls.
- Rejecting an execution request must require a reason.
- Self-approval must be disabled with an explicit reason unless the effective
  Workspace policy is `SELF_APPROVAL_ALLOWED`.

## Workspace Settings UX Rules

- The navigation label must use Workspace language, not Repo Settings.
- GitHub owner/repository fields are connection details inside the Workspace,
  not the product-level settings concept.
- The Lite connection form owns credentials. Shared settings regions show
  connection results, installation readiness and policy, without requiring
  provider-specific input fields or interpreting provider artifacts.
- Saving a connection is not verification. Creating an installation/update or
  policy request is not application. Keep the current and requested policy
  visible as distinct values, with the returned request's source link.
- Connection check saves and verifies the visible editor values on this same
  screen. Install/update/policy requests never save connection fields. Editing,
  explicitly saving, disconnecting or a failed check invalidates the previous
  verification and related request results; unavailable actions carry a compact
  localized reason. A stale response must not re-enable them. Do not add a
  mandatory extra screen or wizard step for this confirmation.
- Keep credential inputs and their stored-session summary together. Workspace
  policy remains a separate responsibility from connection installation status.
  The single Lite editor must not imply that a future Workspace can contain
  only one platform. Connection lists, sharing and transfers are separate scope.
- Check save, connection check, disconnect, missing/partial installation,
  up-to-date installation, update request and policy request paths in English
  and Korean at desktop and mobile widths. Late results from an old connection
  must not replace the new connection's screen state.
- Approval mode changes must create a pull request to
  `.batch-governance/workspace.yml`; the browser must not store approval policy
  as local UI state.
- Generated workflow updates must create a pull request from the Workspace
  screen. The UI must not write workflow files directly to the default branch,
  and it must not present repository-owned policy files as template drift.
- `AUTO_APPROVE` must explain that execution requests receive explicit
  Workspace-policy approval evidence automatically after Issue creation. The UI
  still must not dispatch governed workflows directly. It must also explain
  that this mode includes self-approval permission.

## Gate UX Rules

- Gate is mandatory for Lite batches.
- UI must not present Gate as an optional feature or toggle.
- Gate copy should be compact and close to the action it protects.
- Non-compliant records may be displayed as evidence, but they cannot be
  requested for execution.

## GitHub Delegation UX Rules

- Creating a governed request or execution Issue should route the user to the
  returned internal BatchPlane detail immediately. The GitHub Lite adapter owns
  the repository branch, file, and pull-request mechanics for governed changes.
- The UI should acknowledge that GitHub issue, pull request, and actions
  visibility can lag briefly after creation.
- Browser UI must not imply it directly dispatches governed workflows.
  Dispatch is performed by the repository dispatcher workflow after approval.
- GitHub Actions visibility can lag after dispatch. Run detail links should
  appear when correlation evidence is available, and missing runs should be
  presented as pending visibility rather than as proof that approval failed.

## PR Checklist

App-shell refactors preserve the grouped desktop and horizontally scrollable
mobile navigation, active links, route destinations and legacy redirects.
Language changes retain current page state. Development fixture changes remount
only route content; their selector stays hidden in production. Compare the
same routes before and after extraction in English and Korean at desktop and
390px widths. Structural cleanup is not a visual redesign or a migration of
every route Page.

For every UI screen PR:

- State where the screen sits in the operator journey.
- Confirm that the next action is visually clear.
- Confirm that approval work is separated from failure or audit evidence.
- Confirm that mandatory Gate language is not shown as optional.
- Confirm user-facing strings use i18n resources instead of hardcoded component
  text.
- Confirm validation, GitHub API error, and Gate reason display messages render
  in English and Korean.
- Confirm technical identifiers such as `batchId`, `requestId`, `reasonCode`,
  GitHub labels, workflow paths, and YAML field names remain untranslated.
- Confirm English and Korean copy carry the same product meaning.
- Confirm detail screens include refresh controls and explicit action wording.
