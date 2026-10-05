# BatchPlane Gate Contract

[한국어](./gate-protocol.ko.md)

Status: Shared semantics and current Lite evidence, reconciled 2026-10-05.
Main wire protocol, authentication and reason-code mapping require #227/#228.
No `START | COMPLETE` input is implemented by the current Lite Gate Action.

## Mandatory Boundary

Every controlled business execution must pass verified authorization immediately
before business work. Gate fails closed when required authority is missing,
invalid, stale, consumed or unverifiable. A request ID, digest, label or
caller-supplied actor is not authority on its own.

The platform connector enforces the decision; product policy is not separately
invented by each engine. Direct starts and reruns are part of the supported
enforcement review. Repository/platform administrators can change infrastructure:
document that trust boundary rather than promise prevention of arbitrary
privileged tampering.

## Actual Lite Actions

The executable input/output contract is
[actions/gate/action.yml](../actions/gate/action.yml). It returns `result`,
`reason_code`, `message` and `verified_sha`; it does not implement a general
completion operation. A declared server mode does not prove a Main server exists.

Manual workflow: verified request and approval -> dispatcher -> Gate ->
business job. Repeated approval or native rerun must not reuse authority.
Known role/capability/lookup consistency work is #223; actual approved input
binding is #212; target failed-request termination is #224.

Native schedule workflow:
[schedule-request](../actions/schedule-request/action.yml) records the occurrence,
Gate records acknowledged admission evidence, business-entry verification
checks again before the command, and
[schedule-result](../actions/schedule-result/action.yml) records the exact
attempt's control/business job result. Business jobs do not receive Issue-write
permission for those records.

The [schedule execution contract](./schedule-execution-contract.md) is
authoritative for NATIVE_SCHEDULE_V2. Old delegated-approval markers cannot
authorize new schedules. No new compatibility window is required.

## Authority Sources

- Manual: approved exact execution request under effective Workspace policy.
- Schedule: effective approved owning Batch revision and matching native
  schedule context, independent of manual self/automatic approval mode.

No per-occurrence fabricated approval is created. A schedule's occurrence Issue
is an execution/evidence record, not a new human approval. Emergency bypass is
not approved scope.

Native schedule authority includes event identity, source workflow, current
active definition, approved revision, schedule and source occurrence. Do not
reject a legitimate delayed event merely because the worker started late.
Do not infer a nominal time from creation/worker time.

## Identity, Replay And Side Effects

Lite's source-occurrence identity is the canonical full-SHA-256 representation
of `(repositoryId, batchId, scheduleId, sourceRunId)`. Actual attempt number
correlates evidence; it does not create new authority. Same-Run full and partial
reruns are denied, including replay that tries to skip an earlier control job.

Distinct native Runs are not guaranteed deduplicated for one nominal slot.
Workflow concurrency is not a durable uniqueness record. Required evidence
writes must be acknowledged before business begins; uncertain writes do not
justify a blind retry or a fail-open branch.

For Main, use authenticated native identity scoped by connection/provider,
product authority, approved revision and approved inputs. Concrete permit
issuance, idempotency keys and replay responses are #227/#228 design work.

## Results And Operational Commands

Completion and Gate admission are different facts. A denied attempt is not a
business failure. A missing result is neither success nor failure. Result
correction must refer to the same attempt and preserve its evidence.

Confirmed dispatch failure ends that request; the user submits a new one.
Unknown native acceptance remains unknown until observed. Automatic retry,
same-request redispatch after confirmed failure and implicit authorization for
native rerun are not the approved target.

Approved withdrawal must be rechecked on command/delivery/Gate paths. Queued or
running attempts require explicit real cancel/stop with reason and observable
provider result. Result synchronization only repairs observation. See #225 and
the [roadmap lifecycle decisions](./control-plane-migration-plan.md).

## Main Connector Design Boundary

The earlier proposed `batchplane.io/gate/v1` start/completion envelope is not a
published protocol. #227/#228 must approve versioning, exact fields, identity
authentication, permission mapping, timing and reason codes before implementation.

GitHub OIDC and a Jenkins installation credential/plugin are integration
candidates, not current product guarantees. #231 selects Jenkins's actual
pre-business integration and tests direct/rerun coverage. Avoid speculative
connector frameworks or fallback paths.

Main and Lite should converge on stable product decision meanings; existing
Lite diagnostic codes are not silently renamed by this document. New mappings
require actual contract and UI changes with conformance fixtures.

## Evidence And Acceptance

Record actor/service identity, native execution/attempt, request or schedule
authority, approved revision/input digest, decision, reason and available timing.
Do not record tokens or secret values. Allowed and denied attempts are visible
at the same operating-history level; storage failure must be shown honestly.

#202 remains open for actual GitHub schedule/Gate/result and rerun proof.
The [QA sheet](./user-qa.md) distinguishes local cases, live evidence and
planned commands. No document statement substitutes for that proof.
