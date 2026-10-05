# Main And Lite Conformance

Status: Acceptance plan, reconciled 2026-10-05. Main is not implemented.

## Shared Meaning, Different Implementations

One React product UI calls the
[current product client](../packages/ui-client/src/index.ts). Lite uses GitHub
evidence; Main will use a Kotlin API and MySQL. Equivalent product actions must
have equivalent authorization, state and evidence meanings.

No parallel speculative client or permanent compatibility window is prescribed.
Existing historical readers do not authorize new execution with old delegated
schedule evidence. New schedule writes follow
[NATIVE_SCHEDULE_V2](./schedule-execution-contract.md).

## Required Flow Comparisons

| Flow                       | Shared acceptance                                                                        | Edition-specific fact                                                |
| -------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Registration/change/delete | Approved exact revision/diff; stale content rejected; deleted history retained           | PR evidence in Lite, Main product records and provider apply         |
| Approval                   | Effective policy, real decision actor, self/auto mode and all-target common authority    | Different identity adapters, same permission meaning                 |
| Manual execution           | Approved inputs reach business; delivery, Gate and result remain distinct                | GitHub dispatcher versus Main orchestration                          |
| Scheduled execution        | Approved owning revision, no per-occurrence approval, Gate and real result correlation   | Provider-native schedule identity and timing limits                  |
| Withdrawal/cancel          | State-specific confirmation, real cancellation and requested/confirmed outcome           | Actual platform command and authentication                           |
| Result synchronization     | Repair observations, never execute/cancel                                                | Main first-flow requirement; Lite additional timing remains separate |
| Logs/failures              | Business/Gate distinction, exact execution, business/full logs, explicit manager review  | Native log retention and access                                      |
| Queries                    | Scope-complete period/Batch retrieval, unresolved My Work preserved, no partial-as-empty | GitHub pagination versus Main query projections                      |
| Unified requests           | Multi-Batch/type/Workspace; one common approver for all operations                       | #142 Lite feasibility gate; Main basic model                         |
| Audit                      | Actor, authority, revision, result and source traceability                               | Lite evidence remains editable/deletable under GitHub permissions    |

Approval modes may allow an eligible manager to self-review, but do not silently
auto-close failure explanations. Gate denial does not create a new business
failure explanation requirement.

## Provider Constraints And Truthful Claims

Native identity, timezone support, parameter types, log retention and real cancel
semantics must be documented per provider. Do not silently emulate unsupported
semantics. A native occurrence key is not proof of exactly-once business work
across independently created Runs.

Capabilities express actual support; they are not a reason to hide mandatory
work indefinitely. Lite #225 must complete before Lite acceptance. Main GitHub
and early Jenkins must exercise cancel and result synchronization.

Repository-backed Lite Workspaces retain individual trust boundaries; #142 is
not satisfied by only switching the selected repository. Main supports multiple
platform connections in one Workspace.

## Evidence Strategy

Use [requirements traceability](./requirements-traceability.md) and
[QA cases](./user-qa.ko.md). They distinguish present code, known gaps, planned
work and design-required scope. No user QA is marked passed by this document.

At each flow delivery:

1. Check shared policy/digest contracts with meaningful common fixtures.
2. Check adapter translation and actual permission/evidence boundaries.
3. Exercise affected shared Pages with the applicable client implementation.
4. Record authorized live-provider evidence separately where required.
5. Revalidate affected existing Lite behavior when Main/shared contracts change.

These are risk-based evidence layers, not one test per requirement or a demand
to duplicate every test for every edition. A fixture-backed Main UI demonstrates
composition, not a real server integration.

#230 combines accumulated evidence; it does not postpone conformance until
after all Main work. #231 validates real GitHub/Jenkins first and the selected
third platform later. Early Jenkins proof is not full supported-scope acceptance.

## Release Acceptance

Report implemented scope, automated results, user QA, live provider proof,
remote CI and merge separately. Unimplemented or unverified mandatory flows
cannot be marked conformant. Explicitly accepted nonblocking residuals retain
their impact, owner and follow-up.

First external-release licensing, immutable connectors, rollback and supported
documentation are #193/#196/#68. Their planned status must not be described as
already protected production artifacts.
