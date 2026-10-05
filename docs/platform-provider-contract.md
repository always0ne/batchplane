# Platform Provider Design

Status: Accepted boundary, illustrative Main design; concrete contracts require
#227/#228 and real Jenkins feedback in #231. Reconciled 2026-10-05.

## Responsibilities

Adapters translate provider-native management, execution and observation into
product operations. A connector at the engine's pre-business boundary enforces
Gate. They may be separate deployment units; no plugin, agent or separate
service is mandated before the selected provider's needs are established.

Provider-specific DTOs, IDs, workflow/Job paths, credentials and API errors stay
behind adapters. React receives typed product data and capability information.

## Identity And Capabilities

Keep Workspace, connection, Batch and native-resource identities distinct.
Multiple connections can share a provider type or Workspace. A provider key
identifies the engine kind; it is not a credential or authorization role.

Describe actual supported operations and constraints:

| Area              | Required description                                                               |
| ----------------- | ---------------------------------------------------------------------------------- |
| Controlled change | Registration/update/delete, diff, stale-base detection, confirmed result           |
| Execution         | Approved input delivery, accepted/failed/unknown response, exact native identity   |
| Cancellation      | Real queued/running command, authority, confirmation and already-terminal behavior |
| Schedule          | Native trigger, cron/timezone limits, occurrence identity and duplicate boundaries |
| Observation       | Exact attempt, result, logs, pagination, result synchronization and retention      |
| Gate              | Pre-business enforcement and direct/full/partial rerun coverage                    |
| Installation      | Required artifacts, permissions, current version and controlled upgrade            |

Discovery/onboarding from the earlier proposal remains scope-confirmation work.
Do not build a generic discovery API or configuration-schema renderer by default.

## Minimum Port Design

Define ports from complete approved use cases, not one optional-method interface
or one module per imagined capability. Main's first GitHub flow needs planning/
applying changes, controlled dispatch, cancel, observe/log and result-sync
responsibilities. Exact Kotlin signatures and table/API shapes are not finalized.

Do not expose a generic provider `retry` operation as an approved control path.
After confirmed dispatch failure, new product authorization is required through
a new request. Native retry semantics do not override that policy.

## External Side Effects

An operation retains product correlation, target connection, approved revision
and provider operation/attempt references. Reject stale configuration rather than
apply an approved diff to an unexpected base.

Where a provider supports idempotency, use its real contract. If acceptance is
unknown, reconcile instead of blindly reissuing a non-idempotent dispatch.
A unique MySQL row or Issue label alone cannot guarantee exactly-once native
business effects. Preserve confirmed rejection separately from uncertain
network/observation failure.

## Observation

Use authenticated events or provider queries according to actual capabilities.
Normalize result and diagnostic data without inventing completion. Repeated
events for the same attempt do not create another execution. Result
synchronization reads evidence and corrects product observation; it is not a
retry/cancel operation.

Queries must support bounded retrieval beyond the initial page. Provider
retention limits and permission failures remain distinguishable from no matching
history. Secret-bearing diagnostics must not leak into browser telemetry/audit.

## Scheduling

The platform fires schedules; approved Batch/schedule revision is authority.
Keep configured timezone and real native occurrence identity. No fixed-offset
substitution may silently change daylight-saving semantics. Unknown nominal
time is not worker start time.

Do not promise cross-Run nominal-slot uniqueness when the provider cannot prove
it. No automatic backfill/catch-up/re-execution is approved. Main delay monitoring
is #229; the current Lite specifics are in the
[schedule contract](./schedule-execution-contract.md).

## UI And Packaging

Product Pages own workflow and layout. Typed provider configuration components
can be injected at established runtime boundaries. Do not load untrusted remote
UI code or add a generic form engine, arbitrary JAR loader or separate SDK
without approved need.

Keep the actual monorepo package layout until a concrete integration requires
change. Provider contracts can later stabilize into contributor-facing APIs;
the earlier descriptor/version examples are not released interfaces.

## Validation Order And Support Claims

1. Complete Main GitHub registration/manual execution, including approved inputs,
   Gate, results/log/audit, cancellation and result synchronization.
2. Exercise the same flow with real Jenkins in the same Workspace.
3. Extend controlled change/delete, schedule and failure-review scope; select a
   third platform with meaningfully different traits and approve its test scope.

The reusable provider conformance cases should cover actual input mapping,
stale change rejection, permission checks, direct/rerun Gate enforcement,
uncertain acceptance, cancellation, result correlation, timezone limits,
pagination and secret handling. Avoid duplicating every fixture per provider
without a distinct risk.

An initial API connection or mock does not establish full platform support.
Record supported Job types, enforcement limits, credentials, versions and actual
evidence. Immutable artifact/release/update/rollback rules are #196 at first
external release, not a claim that development `@main` is production-pinned.
