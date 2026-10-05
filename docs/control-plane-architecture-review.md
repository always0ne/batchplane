# Architecture Baseline Reconciliation Review

Status: Documentation review for PR #192 and #232, 2026-10-05.
This is not a new multi-agent review, whole-code audit or live acceptance result.

## Evidence And Scope

Compared the approved roadmap, current open issues/milestones, main baseline
`35eb868396d85e80a1a7c81297e59a3a19e9ffb8`, the actual product-client interface,
router, Action descriptors and native schedule contract with the older #192
proposal. Current source was consulted for documentation truth, not changed.

## Findings Addressed In This PR

| Perspective  | Stale or conflicting claim                                                | Reconciliation                                                                                                 |
| ------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Product      | Lite multi-Workspace meant switching/read-only portfolio only             | #142 retains aggregate queries and multi-Batch/type/Workspace requests with one common approver.               |
| Architecture | A large module tree, grouped client and ui-kit appeared mandatory         | Existing client/ownership is the baseline; minimum Main modules/contracts require #227 approval.               |
| Developer    | Extract client/evidence again as the next step                            | R1-R7 are already the baseline; next code work is #223, then #212/#224/#225.                                   |
| Operator     | Failed dispatch could retry the same approval                             | Confirmed failure ends the request; new request required; unknown outcome is distinct.                         |
| Operator     | Cancellation was a late optional feature                                  | Lite #225 before acceptance; Main cancel and separate result synchronization in first flow.                    |
| Auditor      | GitHub comments were called immutable                                     | Product append-only behavior and GitHub edit/deletion/retention limits are explicit.                           |
| Schedule     | Delegated approval compatibility and second dispatcher were current       | NATIVE_SCHEDULE_V2 uses approved revision, same native execution and exact occurrence/job/attempt correlation. |
| Schedule     | Start/complete Gate Action operations were implemented                    | Actual Lite Gate and separate schedule-result Action are documented; server envelope stays a proposal.         |
| UX           | Operations/Governance/Run navigation and feature folders were the target  | Actual executions/workspace/request routes and page-owned components are documented.                           |
| QA           | Full app CI was needed for this document PR; documents implied acceptance | Document-only checks; user QA starts NOT_TESTED, #202 live evidence remains pending.                           |
| Roadmap      | Jenkins waited until all Main work was finished                           | Real Jenkins immediately follows Main's first GitHub operating flow.                                           |
| Release      | Immutable production artifacts were described as already available        | #196 release work is explicitly pending; moving development refs are not production proof.                     |

## Open Scope And Design

Earlier requirements for native discovery/onboarding, audit export, external
notifications and recurrence reports retain their IDs and original priority.
The owner must confirm their detailed scope and roadmap placement. They are not
removed, made optional or claimed implemented while that answer is pending.

Exact Main membership/authority, IDs, API/MySQL contracts, provider integration,
multi-Workspace evidence storage and cancellation permission mappings require
their approved design steps. The documents describe accepted semantics and label
illustrative shapes instead of claiming these decisions are complete.

## Delivery Evidence

The [traceability table](./requirements-traceability.md) links all product SRS
groups to work and QA. The [Korean QA sheet](./user-qa.ko.md) and
[result template](./qa-result-template.ko.md) support repeatable user validation
and change-impact selection.

This PR changes documentation and retains its pre-existing package-description
edit. It does not implement the roadmap, execute consumed repositories, verify
remote CI or merge itself. Document-check results belong in the PR delivery
receipt; manual and live results must be recorded from actual execution.
