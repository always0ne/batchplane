# BatchPlane Gate Protocol

Status: Architecture baseline for issue #191

## Purpose

Gate is the mandatory pre-business execution boundary for governed batches. It
answers whether one concrete native execution attempt may begin and records the
result against the same attempt through completion.

Gate policy belongs to BatchPlane Core. GitHub Actions, Jenkins Plugin, and
future connectors detect the platform lifecycle boundary, authenticate the
native attempt, enforce the decision, and report completion. They do not define
independent approval policy.

## Protocol Versions

The initial protocol identifier is:

```text
batchplane.io/gate/v1
```

Connectors advertise supported protocol versions during installation and
health inspection. A server MUST reject an unsupported major version.

## Modes

### Server Mode

The platform-side connector calls the Kotlin Main Gate API. Main resolves
Workspace, connection, Batch revision, trigger, approval or schedule authority,
permit state, policy, and native execution identity.

### Lite Mode

The GitHub Gate Action verifies GitHub-backed evidence inside the target
repository. Lite mode implements the same decision meanings and reason codes,
but reads repository files, Issues, comments, and GitHub Actions context instead
of calling a BatchPlane server.

## Start Request

Illustrative server request:

```json
{
  "apiVersion": "batchplane.io/gate/v1",
  "operation": "START",
  "workspaceId": "workspace-1",
  "platformConnectionId": "github-prod",
  "providerKey": "github-actions",
  "batchId": "payment.daily-close",
  "nativeExecution": {
    "resourceType": "workflow-run",
    "resourceId": "123456789",
    "attempt": 1,
    "nativeUrl": "https://github.example/run/123456789"
  },
  "trigger": {
    "type": "MANUAL",
    "executionIntentId": "exec-intent-1",
    "scheduleId": null,
    "scheduledAt": null
  },
  "batchRevisionDigest": "sha256:...",
  "parameterDigest": "sha256:...",
  "occurredAt": "2026-08-31T00:00:00.000000Z",
  "connector": {
    "type": "github-action",
    "version": "1.0.0"
  }
}
```

The connector authentication envelope is transport-specific and is not trusted
merely because fields in the JSON name a repository or actor.

For a scheduled start, the same envelope uses Schedule Revision authority:

```json
{
  "trigger": {
    "type": "SCHEDULE",
    "executionIntentId": null,
    "scheduleId": "payment.daily-close.weekday-0900",
    "scheduleRevisionId": "schedule-revision-42",
    "providerOccurrenceKey": "native-occurrence-key",
    "expectedAt": "2026-08-31T00:00:00.000000Z",
    "observedAt": "2026-08-31T00:03:12.000000Z"
  }
}
```

`expectedAt` may be absent when the provider cannot identify a stable expected
slot. `observedAt`, authenticated native execution identity, and provider
occurrence key remain required according to the provider capability contract.

## Start Response

Allowed response:

```json
{
  "apiVersion": "batchplane.io/gate/v1",
  "decision": "ALLOW",
  "executionAttemptId": "attempt-1",
  "decisionId": "gate-decision-1",
  "authority": {
    "type": "EXECUTION_INTENT",
    "authorityId": "exec-intent-1"
  },
  "decidedAt": "2026-08-31T00:00:00.100000Z"
}
```

Denied response:

```json
{
  "apiVersion": "batchplane.io/gate/v1",
  "decision": "DENY",
  "executionAttemptId": "attempt-1",
  "decisionId": "gate-decision-1",
  "reasonCode": "AUTHORIZATION_NOT_FOUND",
  "messageKey": "gate.authorizationNotFound",
  "decidedAt": "2026-08-31T00:00:00.100000Z"
}
```

The connector MUST enforce `DENY` by preventing the first business command or
Job body from running. UI-localized text is not part of the signed decision.

## Completion Request

```json
{
  "apiVersion": "batchplane.io/gate/v1",
  "operation": "COMPLETE",
  "executionAttemptId": "attempt-1",
  "nativeExecution": {
    "resourceType": "workflow-run",
    "resourceId": "123456789",
    "attempt": 1
  },
  "outcome": "FAILED",
  "startedAt": "2026-08-31T00:00:01.000000Z",
  "completedAt": "2026-08-31T00:10:01.000000Z",
  "nativeEvidenceRefs": []
}
```

Completion is idempotent. Repeated identical completion is accepted without
creating another attempt. Conflicting completion produces an audit exception
and reconciliation work; it does not silently overwrite history.

A platform integration must arrange completion reporting after the business
body, including failed and canceled outcomes. In GitHub Actions this is a
generated `if: always()` completion job correlated to the Gate output. The Gate
Action exposes `START` and `COMPLETE` operations; Server mode calls the Gate API,
while Lite mode writes structured repository/run evidence that the Lite
projection can correlate. In Jenkins it is a post-build/plugin lifecycle
callback. When completion cannot be reported, observation reconciliation moves
the attempt to an explicit unknown or recovered terminal state rather than
inventing success.

## Authentication

### GitHub Actions Main

- The Gate Action obtains a GitHub Actions OIDC identity when available.
- The generated Gate job grants only `id-token: write` and the least repository
  permissions required by its mode.
- Main validates issuer, audience, repository/owner, workflow, ref, actor,
  event, `run_id`, `run_attempt`, `workflow_ref`, and `workflow_sha` claims
  against the Platform Connection.
- The request body cannot override identity claims.
- The GitHub App/server adapter is used for management and observation; browser
  personal access tokens are not the Main trust model.

### GitHub Actions Lite

- The action uses the repository-scoped GitHub token to read required evidence.
- It verifies the workflow/run context, batch definition, Workspace policy,
  request or schedule evidence, digest, and approver authorization.
- Direct dispatch inputs are untrusted until repository evidence is verified.

### Jenkins

- Jenkins Plugin uses an installation identity bound to one Platform
  Connection, preferably mTLS or a renewable service credential.
- Plugin-reported Job/build identities are validated against connection scope.
- Individual Job configurations do not embed approval policy.

## Authorization Sources

Gate accepts only explicit authority types:

- `EXECUTION_INTENT`: approved manual/API/upstream intent.
- `SCHEDULE_REVISION`: effective approved schedule for this occurrence.
- `BREAK_GLASS`: separately governed emergency authority if implemented.

Workspace automatic-approval mode may create an authorized Execution Intent,
but it is not a substitute for Schedule Revision authority.

## Scheduled Execution

For a scheduled trigger, Gate verifies:

- Batch and schedule belong to the same effective Batch revision.
- Schedule revision is approved, enabled, and effective.
- Native scheduled time matches the schedule within a documented provider
  tolerance.
- Provider/connection/native schedule identity matches the approved target.
- Batch revision and provider configuration have not drifted.
- The native execution attempt has not already consumed authority.
- Overlap, concurrency, and misfire policy allow the occurrence.

Each occurrence creates an Execution Attempt and Gate Decision. It does not
create a fictitious human approval decision.

## Manual And API Execution

For a manual/API/upstream trigger, Gate verifies:

- Execution Intent exists and is authorized under its policy revision.
- Request digest, Batch revision, parameter digest, and target match.
- Authorization is unexpired, unconsumed, and not canceled.
- Native execution identity is bound to the intended dispatch when known.
- Direct native execution without a matching intent is denied.

## Rerun And Retry

- A provider UI rerun creates a new native attempt.
- A consumed permit or previous Gate decision does not authorize the new
  attempt.
- A product retry creates a new Execution Intent/authorization or an explicit
  retry authority according to policy.
- Lite continues to deny GitHub Actions `run_attempt > 1` unless a future
  evidence contract explicitly authorizes that attempt.

## Idempotency

The logical start key is:

```text
workspaceId + platformConnectionId + providerKey
+ native resource ID + native attempt
```

The same authenticated start request returns the existing decision and
`executionAttemptId`. A payload mismatch for an existing key is denied and
audited.

## Stable Reason Codes

Initial cross-provider reason codes include:

- `AUTHORIZATION_NOT_FOUND`
- `AUTHORIZATION_EXPIRED`
- `AUTHORIZATION_CONSUMED`
- `AUTHORIZATION_CANCELED`
- `APPROVAL_INCOMPLETE`
- `POLICY_REVISION_MISMATCH`
- `BATCH_NOT_FOUND`
- `BATCH_INACTIVE`
- `BATCH_REVISION_MISMATCH`
- `BATCH_DRIFT_DETECTED`
- `SCHEDULE_NOT_FOUND`
- `SCHEDULE_DISABLED`
- `SCHEDULE_NOT_EFFECTIVE`
- `SCHEDULE_OCCURRENCE_MISMATCH`
- `PARAMETER_DIGEST_MISMATCH`
- `NATIVE_EXECUTION_MISMATCH`
- `CONNECTOR_NOT_AUTHORIZED`
- `CONNECTOR_INCOMPATIBLE`
- `RERUN_NOT_AUTHORIZED`
- `DUPLICATE_ATTEMPT_MISMATCH`
- `BREAK_GLASS_NOT_AUTHORIZED`
- `EVIDENCE_LOOKUP_FAILED`

Edition-specific diagnostic codes MAY be attached, but UI and audit filters use
the stable cross-provider reason.

## Availability And Failure Policy

Gate is fail closed by default. Timeout, authentication failure, incompatible
protocol, missing evidence, and unavailable policy authority produce `DENY` or
a non-starting platform failure.

Production deployment must define:

- Gate timeout and retry budget.
- Circuit behavior that remains fail closed.
- connector retry and idempotency behavior.
- Main availability and recovery targets.
- documented break-glass policy, if any.

The product MUST NOT introduce an implicit local cache that permits business
execution after the decision authority becomes unavailable.

## Audit Requirements

Start and completion record:

- connector identity and version
- normalized and native execution references
- request/schedule authority and revision
- Batch and policy revision digests
- decision, reason, and timing
- duplicate, replay, mismatch, and reconciliation information
- source evidence references without persisting raw logs

Allowed and denied attempts are equally auditable.
