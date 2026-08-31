# BatchPlane Unified Control Plane SRS

Status: Architecture baseline for issue #191

This document defines product-level requirements shared by Main and Lite.
Edition-specific specifications may refine storage, transport, and user handoff,
but must not change the product meaning defined here.

## Requirement Language

- `MUST` is required for the P0 product contract.
- `SHOULD` is expected unless an edition or provider records a justified
  deviation.
- `MAY` is optional behavior.

## Actors

- `Requester`: proposes a governed change or execution.
- `Approver`: makes approval or rejection decisions.
- `Operator`: performs or monitors batch operations.
- `Workspace Manager`: manages connections, policies, and follow-up reviews.
- `Auditor`: reads evidence without mutating operational state.
- `Platform Service`: an authenticated provider-side action, plugin, agent, or
  webhook sender.
- `BatchPlane Automation`: dispatcher, reconciler, notifier, or outbox worker.

## Workspace And Platform Connections

- `CP-WSP-001` A user MUST be able to belong to multiple Workspaces.
- `CP-WSP-002` Main MUST support multiple Platform Connections in one
  Workspace. Lite MUST support multiple concurrently connected
  repository-backed Workspaces in one session and MUST NOT imply a shared
  cross-repository policy authority where none exists.
- `CP-WSP-003` A Platform Connection MUST identify a provider, endpoint or
  installation, credential reference, capability set, health state, and
  enforcement coverage.
- `CP-WSP-004` Credentials MUST NOT be returned to the UI after storage.
- `CP-WSP-005` Main MUST store credential references through a secret-provider
  boundary rather than storing browser-supplied long-lived tokens in UI state.
- `CP-WSP-006` Lite MUST keep its GitHub credential in volatile session storage
  only and MUST document the browser trust limitation.
- `CP-WSP-007` Workspace switching MUST change all list, detail, action, and
  audit queries to the selected Workspace without leaking data from another
  Workspace.
- `CP-WSP-008` Connection health MUST distinguish authentication failure,
  unavailable provider, incompatible connector, missing Gate installation, and
  degraded observation.
- `CP-WSP-009` Lite MUST provide Workspace switching and MAY aggregate
  read-only portfolio views across session-connected Workspaces, while writes
  and policy decisions remain scoped to exactly one repository-backed
  Workspace.

## Provider Capability And Installation

- `CP-PRV-001` Every provider MUST publish a stable provider key and version.
- `CP-PRV-002` Every connection MUST expose supported capabilities instead of
  relying on provider-name conditionals in the UI.
- `CP-PRV-003` Capability declarations MUST cover catalog, governed change,
  execution, cancellation, schedules, run observation, logs, Gate enforcement,
  installation, health, and reconciliation independently.
- `CP-PRV-004` Unsupported actions MUST be visibly unavailable with an explicit
  provider reason.
- `CP-PRV-005` Provider installation MUST report connector version,
  compatibility, enforcement coverage, and required upgrade actions.
- `CP-PRV-006` A provider MUST pass the Adapter TCK for every capability it
  declares.
- `CP-PRV-007` A provider MUST normalize errors into product error codes while
  preserving a restricted native diagnostic for operators.
- `CP-PRV-008` Managed platform connectors and Actions MUST record their exact
  version. Production templates MUST use an approved immutable release ref or
  commit SHA; a moving development branch MUST NOT be treated as a production
  installation.

## Batch Catalog And Onboarding

- `CP-BAT-001` BatchPlane MUST provide one batch inventory across Platform
  Connections in a Workspace.
- `CP-BAT-002` A Batch MUST have a global Batch ID and a separate native
  external resource reference.
- `CP-BAT-003` The core Batch model MUST NOT require a GitHub workflow path,
  Jenkins Job name, runner label, or another provider-specific identifier.
- `CP-BAT-004` Providers SHOULD support discovery of existing native batches.
- `CP-BAT-005` Discovered batches MUST be classified as governed, ungoverned,
  partially governed, missing, or drifted.
- `CP-BAT-006` An existing native batch MUST be linkable to a BatchPlane Batch
  without recreating the native resource when the provider supports onboarding.
- `CP-BAT-007` Active governed batches MUST identify their effective revision,
  Platform Connection, provider, policy, schedule summary, enforcement status,
  and recent execution state.
- `CP-BAT-008` Deleted batches and their historical revisions, requests, runs,
  failures, and audit records MUST remain directly queryable.

## Governed Registration, Change, And Deletion

- `CP-CHG-001` Register, update, suspend, restore, and delete operations MUST
  begin as a Change Request and MUST NOT mutate a native platform before
  authorization.
- `CP-CHG-002` A Change Request MUST contain the requester, reason, target,
  operation type, base revision, proposed revision, normalized diff, native
  diff when available, and request digest.
- `CP-CHG-003` The approval screen MUST show material change context without
  requiring the approver to interpret raw YAML or native configuration first.
- `CP-CHG-004` Applying an approved request MUST verify that the target base
  revision has not changed since approval.
- `CP-CHG-005` A stale base revision MUST produce a conflict and MUST NOT apply
  the approved change silently.
- `CP-CHG-006` Provider mutation MUST be idempotent and MUST record native
  operation identifiers and outcomes.
- `CP-CHG-007` A provider-generated PR or native review object MAY be retained
  as implementation evidence, but Main MUST NOT require a second independent
  product approval unless Workspace policy explicitly requires it.
- `CP-CHG-008` Lite MAY use a Pull Request as both the Change Request and
  approval surface.
- `CP-CHG-009` Direct external changes MUST be detected by reconciliation and
  reported as drift or ungoverned mutation evidence.

## Approval And Separation Of Duties

- `CP-APR-001` Approval policy MUST be expressed in BatchPlane internal roles,
  not provider-native roles.
- `CP-APR-002` External user, group, team, and repository roles MAY be mapped to
  internal roles through an identity adapter.
- `CP-APR-003` Every decision MUST identify the policy revision and subject
  digest evaluated at decision time.
- `CP-APR-004` Rejection MUST require a reason.
- `CP-APR-005` Self-approval MUST be denied by default.
- `CP-APR-006` An explicit Workspace policy MAY allow self-approval or automatic
  authorization, but the resulting evidence MUST identify the relaxed mode.
- `CP-APR-007` A later policy change MUST NOT alter the historical meaning of a
  recorded decision.
- `CP-APR-008` Approval and execution authorization MUST be modeled separately.
- `CP-APR-009` Approved work that is stale, expired, canceled, already consumed,
  or inconsistent with the current target MUST NOT produce a new authorization.
- `CP-APR-010` A policy, role-binding, credential, or installation proposal
  MUST be authorized by the policy effective before the proposal and MUST NOT
  authorize itself using proposed values.

## Execution Intents And Authorization

- `CP-EXE-001` Manual, API, upstream, schedule, and native triggers MUST map to a
  normalized Execution Intent or Scheduled Occurrence context.
- `CP-EXE-002` Manual execution MUST record requester, reason, parameters,
  target revision, workflow or Job target, expiration, and request digest.
- `CP-EXE-003` Sensitive parameter values MUST NOT be written to audit text,
  request bodies, browser storage, or logs; a digest or secret reference MAY be
  recorded.
- `CP-EXE-004` Approval MUST bind to the complete normalized execution intent.
- `CP-EXE-005` Main MUST issue a short-lived, scope-bound, single-consumption
  Execution Permit only after successful authorization.
- `CP-EXE-006` A permit MUST bind Workspace, Platform Connection, Batch,
  revision, trigger, request or schedule authority, parameter digest, expiry,
  and intended native execution when known.
- `CP-EXE-007` A new retry or rerun MUST create a new attempt and MUST NOT reuse
  consumed authorization implicitly.
- `CP-EXE-008` Dispatch failure MUST remain distinguishable from Gate denial and
  business failure.

## Schedule Governance

- `CP-SCH-001` Schedules MUST be logically owned by a Batch revision even when
  a read projection stores them separately.
- `CP-SCH-002` Schedule registration, update, enable, disable, and deletion MUST
  be governed changes.
- `CP-SCH-003` The UI MUST validate cron syntax, timezone, provider limits, and
  show expected future occurrence times before request creation.
- `CP-SCH-004` The native batch platform SHOULD remain responsible for firing
  scheduled triggers.
- `CP-SCH-005` An approved and currently effective Schedule Revision is the
  authorization source for each matching scheduled occurrence.
- `CP-SCH-006` A scheduled occurrence MUST NOT fabricate a human approval or
  depend on Workspace automatic-approval mode.
- `CP-SCH-007` Every occurrence MUST create a distinct Execution Attempt and
  Gate decision correlated to the approved Schedule Revision.
- `CP-SCH-008` The system MUST prevent duplicate processing of the same native
  scheduled occurrence while preserving duplicate-delivery evidence.
- `CP-SCH-009` Disabled, deleted, drifted, or superseded schedules MUST be denied
  at Gate even if the native platform still fires them.
- `CP-SCH-010` Overlap, misfire, retry, and concurrency policy MUST be explicit
  and provider-capability aware.

## Gate Enforcement

- `CP-GAT-001` Governed business work MUST encounter Gate before the first
  business command or Job body starts.
- `CP-GAT-002` Gate policy MUST be owned by BatchPlane Core, not reimplemented
  independently in provider connectors.
- `CP-GAT-003` A platform-side Gate connector MUST authenticate itself and bind
  the request to a native execution identity.
- `CP-GAT-004` Gate MUST fail closed when authorization evidence is missing,
  invalid, expired, consumed, stale, or unverifiable.
- `CP-GAT-005` Gate MUST record both allowed and denied start attempts.
- `CP-GAT-006` A direct native run, rerun, schedule trigger, or API trigger MUST
  not bypass Gate.
- `CP-GAT-007` Completion MUST update the same attempt created or recognized at
  start and MUST be idempotent.
- `CP-GAT-008` Gate reason codes MUST be stable product contracts and MUST be
  translated only at the UI boundary.
- `CP-GAT-009` A connection without verified pre-start coverage MUST be marked
  `UNPROTECTED` or `PARTIALLY_PROTECTED`; it MUST NOT appear fully governed.
- `CP-GAT-010` Emergency bypass, if introduced, MUST be a separately approved,
  time-bounded break-glass flow and MUST never be an undocumented fail-open.
- `CP-GAT-011` A provider integration MUST report terminal outcome for every
  Gate-allowed attempt or reconcile it to an explicit `UNKNOWN` state; Gate
  start evidence alone is not a complete execution record.

## Run Observation And Logs

- `CP-RUN-001` The run list MUST normalize queued, running, succeeded, business
  failed, Gate blocked, canceled, timed out, and unknown states.
- `CP-RUN-002` Run detail MUST show provider, native run identity, Batch,
  revision, trigger, actor, request or schedule authority, Gate decision,
  start/end times, and native source links.
- `CP-RUN-003` Gate block MUST be visually and semantically separate from
  business failure.
- `CP-RUN-004` Native logs MUST be fetched on demand and MUST not be persisted as
  audit evidence by default.
- `CP-RUN-005` Log access MUST obey Workspace and provider authorization and
  MUST avoid exposing secrets in application telemetry.
- `CP-RUN-006` Missing or late provider events MUST be reconciled through an
  adapter-supported fallback without creating duplicate attempts.

## Failure Follow-Up

- `CP-FAL-001` Business failure MUST create or expose a follow-up case; Gate
  denial MUST remain a control exception rather than a business failure.
- `CP-FAL-002` A follow-up MUST capture cause category, explanation, action,
  owner, due state, author, and related attempt.
- `CP-FAL-003` Cause categories MUST be Workspace-configurable and stable enough
  for recurrence analysis.
- `CP-FAL-004` Submitted follow-up MUST require a Workspace Manager review
  before closure.
- `CP-FAL-005` Review approval, rejection, or change request MUST be a separate
  immutable decision.
- `CP-FAL-006` Repeated failures by Batch, cause, provider, or owner SHOULD be
  available as a report without losing individual evidence.

## Audit And Evidence

- `CP-AUD-001` User, automation, policy, Gate, provider mutation, reconciliation,
  and failure-review actions MUST emit audit events.
- `CP-AUD-002` Audit records MUST be append-only through supported product APIs.
- `CP-AUD-003` Events MUST include actor type, actor identity, Workspace,
  subject, action, outcome, reason, occurred-at time, correlation identifiers,
  and evidence source.
- `CP-AUD-004` Material mutations MUST include before/after revision references
  or canonical digests.
- `CP-AUD-005` Main MUST support export by time, Workspace, Batch, request,
  execution attempt, actor, provider, and outcome.
- `CP-AUD-006` Retention MUST be configurable by deployment policy; no default
  retention claim implies compliance with a specific jurisdiction.
- `CP-AUD-007` Lite MUST project repository-backed evidence into the same audit
  semantics and MUST preserve native source links.

## Notifications And Work Queues

- `CP-NOT-001` My Work MUST derive actionable items from requests, approvals,
  failed execution, follow-up, and manager review state.
- `CP-NOT-002` Notifications MUST be emitted from committed state through the
  outbox in Main.
- `CP-NOT-003` Notification delivery failure MUST NOT roll back the governed
  business transaction.
- `CP-NOT-004` Notification adapters MAY support email, chat, webhook, or other
  channels without changing domain state transitions.
- `CP-NOT-005` Every notification deep link SHOULD open the corresponding
  BatchPlane detail screen before offering a native provider link.

## Shared UI

- `CP-UI-001` Main and Lite MUST use the same React/Vite source tree.
- `CP-UI-002` Main and Lite MAY produce separate builds with different runtime
  bootstrap configuration.
- `CP-UI-003` Pages MUST receive a product client/runtime through application-
  level dependency injection and MUST NOT create a GitHub client directly.
- `CP-UI-004` Product routes and primary labels MUST be provider-neutral.
- `CP-UI-005` Provider-specific paths, Job names, logs, and source links MAY be
  displayed as native evidence.
- `CP-UI-006` Batch, run, failure, request, and audit lists MUST support
  Workspace, provider, and connection context where applicable.
- `CP-UI-007` UI capability checks MUST use runtime/provider descriptors rather
  than string comparisons against provider names.
- `CP-UI-008` English is the default locale and Korean is bundled; contributors
  MUST be able to add locale resources without changing feature logic.

## Main Runtime And Persistence

- `CP-MAIN-001` Main MUST be implemented as a Kotlin/Spring Boot modular
  monolith before considering service decomposition.
- `CP-MAIN-002` Main MUST use MySQL with transactional state changes.
- `CP-MAIN-003` Current state, append-only audit events, and outbox records MAY
  share one MySQL deployment but MUST have separate table responsibilities.
- `CP-MAIN-004` External side effects MUST occur after committed state through
  idempotent workers or an explicitly recoverable orchestration.
- `CP-MAIN-005` Provider credentials MUST be encrypted or stored behind an
  external secret-manager adapter.
- `CP-MAIN-006` Schema changes MUST use versioned migrations.

## Reliability And Security

- `CP-NFR-001` All command endpoints MUST require an idempotency key or derive a
  stable operation key.
- `CP-NFR-002` Webhooks and provider events MUST be treated as at-least-once
  delivery.
- `CP-NFR-003` Exactly-once business claims MUST be implemented through unique
  constraints and idempotent transitions, not transport assumptions.
- `CP-NFR-004` All persisted timestamps MUST be normalized to UTC with
  sub-second precision; display timezone is a UI concern.
- `CP-NFR-005` Logs, tokens, credentials, sensitive parameters, and identity
  assertions MUST be redacted from product logs.
- `CP-NFR-006` Workspace data access MUST be enforced in application and query
  boundaries, not only by UI filtering.
- `CP-NFR-007` Rate limits, provider outages, webhook lag, and reconciliation
  lag MUST be observable.
- `CP-NFR-008` Availability, throughput, RPO, RTO, audit retention, and maximum
  evidence export size MUST be deployment-profile decisions recorded before a
  production release.

## Traceability

Edition and provider specifications MUST reference these requirement IDs.
Deviation documents MUST identify the requirement, reason, user impact,
mitigation, and intended closure release.
