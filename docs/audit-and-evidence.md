# BatchPlane Audit And Evidence

Status: Architecture baseline for issue #191

## Purpose

BatchPlane audit answers who requested, approved, applied, attempted, allowed,
denied, executed, failed, explained, and reviewed each governed operation. It
must connect product state to native provider evidence without claiming that
raw provider logs are an immutable product ledger.

## Evidence Layers

| Layer              | Purpose                                 | Main                   | Lite                             |
| ------------------ | --------------------------------------- | ---------------------- | -------------------------------- |
| Product state      | Current actionable state                | MySQL state tables     | Derived from repository evidence |
| Immutable decision | Approval, Gate, review                  | Append-only MySQL rows | PR/Issue comments and reviews    |
| Audit event        | Search and export timeline              | `audit_event`          | Normalized projection            |
| Native evidence    | Provider operation and execution source | Evidence reference     | GitHub source URL/ID             |
| Raw logs           | Troubleshooting                         | Fetched on demand      | Fetched on demand                |

Raw logs are volatile operator evidence by default. They may contain secrets,
can be large, and may follow provider retention rather than BatchPlane audit
retention.

## Audit Event Envelope

```json
{
  "apiVersion": "batchplane.io/audit/v1",
  "eventId": "event-1",
  "eventType": "GATE_DECIDED",
  "eventVersion": 1,
  "workspaceId": "workspace-1",
  "occurredAt": "2026-08-31T00:00:00.000000Z",
  "recordedAt": "2026-08-31T00:00:00.010000Z",
  "actor": {
    "principalId": "principal-1",
    "type": "USER",
    "externalSubject": "redacted-or-safe-subject"
  },
  "subject": {
    "type": "EXECUTION_ATTEMPT",
    "id": "attempt-1"
  },
  "action": "GATE_START",
  "outcome": "DENIED",
  "reasonCode": "AUTHORIZATION_NOT_FOUND",
  "correlation": {
    "batchId": "payment.daily-close",
    "executionAttemptId": "attempt-1"
  },
  "beforeDigest": null,
  "afterDigest": "sha256:...",
  "evidenceRefs": []
}
```

## Required Event Families

### Identity And Access

- authentication success/failure where policy permits recording
- Workspace membership and role binding change
- policy revision creation and activation
- provider credential creation, rotation, and revocation without secret value
- authorization denial for sensitive commands

### Platform Connection

- connection created, changed, disabled, or deleted
- capability and compatibility changed
- installation/upgrade planned and applied
- health or enforcement coverage changed

### Batch And Schedule

- discovery and onboarding
- register/change/delete request submitted
- approval/rejection/cancel
- provider apply started/completed/failed
- revision activated
- schedule revision activated/disabled/deleted
- drift, unmanaged change, or missing native resource detected

### Execution And Gate

- execution intent requested/approved/rejected/canceled/expired
- dispatch started/accepted/failed/retried
- native start observed
- Gate allowed/denied
- native run started/completed/canceled/timed out
- event conflict or reconciliation correction
- direct or unauthorized native attempt detected

### Failure Follow-Up

- failure case opened
- explanation/action submission
- manager approval/rejection/change request
- case closure and recurrence report generation

## Append-Only Rules

- Supported application APIs never update or delete an existing audit event.
- Corrections create a new event referencing the superseded or corrected event.
- Approval decisions, Gate decisions, historical Batch revisions, failure
  submissions, and manager reviews are immutable records.
- Current-state projections may change, but their transitions emit events.
- Database administration remains a privileged infrastructure risk and must be
  addressed by deployment controls, backups, access logs, and export policy.

Append-only application behavior does not by itself prove regulatory
compliance. Deployment and organizational controls remain necessary.

## Canonical Digests

Material governed objects use canonical serialization and SHA-256 digests for:

- Change Request proposed revision and change plan
- Execution Intent and non-secret parameter bindings
- Approval subject
- Batch and Schedule revisions
- Gate request identity
- before/after audit references

Canonical rules and test vectors are language-neutral. Kotlin, TypeScript, and
provider connectors must produce identical digests for the same fixture.

A digest detects mismatch; it is not an authorization credential.

## Correlation

Audit queries support:

- Workspace and Platform Connection
- Provider and external resource
- Batch and Batch revision
- Change Request and Approval Case
- Execution Intent, Schedule Revision, and Execution Attempt
- Gate decision and native run
- Failure Case and review
- Principal, action, outcome, and reason code
- time range and correlation/trace ID

One user-visible timeline may combine events from separate lifecycles while
preserving each event's subject and source.

## Main Transaction Boundary

For a state-changing Main command, one MySQL transaction writes:

1. aggregate/current-state change
2. immutable decision or revision record when applicable
3. append-only audit event
4. outbox event for provider side effect or notification

The external provider call occurs after commit. Its result creates another
idempotent state transition and audit event.

## Lite Projection

Lite maps GitHub evidence to common event meanings:

- merged governed PR to change approval/apply events
- Issue body to execution intent evidence
- approval/rejection comment to decision event
- dispatcher marker/comment to dispatch event
- Gate action result to Gate decision event
- workflow run to execution-attempt event
- failure and review comments to follow-up events

Parsers preserve source URL, repository, number/ID, actor, and native timestamp.
Writers use the current BatchPlane namespace while readers may retain legacy
BatchTrail compatibility during the documented migration period.

## Export

Main audit export must support machine-readable JSON/NDJSON and a human-readable
report format. An export includes:

- explicit query scope and generated time
- product and schema versions
- ordered events
- evidence references
- export manifest and content digest
- incomplete-source warnings when provider evidence is unavailable

Large exports run asynchronously through the outbox/job mechanism and require
auditor authorization. Exporting audit data is itself audited.

## Retention And Privacy

- Retention is configurable per deployment policy and evidence category.
- Historical Batch and execution evidence must survive Batch deletion.
- Expiration or deletion must follow an auditable retention job, not ad hoc UI
  deletion.
- Personal data stored in audit events is minimized to stable identity and
  necessary display context.
- Secret values, access tokens, raw identity assertions, and sensitive
  parameters are prohibited.
- Provider raw logs retain their provider policy unless explicitly archived by
  a separately designed secure log-retention feature.

No retention duration is fixed in the product architecture until legal,
security, and operating requirements for a deployment are confirmed.

## Integrity And Operations

Main production deployments should support:

- restricted write access to audit tables
- encrypted transport and storage
- database backups and restore tests
- optional batch/export hash chaining for tamper-evidence requirements
- monitoring for missing sequence, outbox lag, reconciliation lag, and export
  failure
- time synchronization and UTC timestamp validation

Hash chaining is an optional deployment hardening decision, not a replacement
for database and organizational access controls.
