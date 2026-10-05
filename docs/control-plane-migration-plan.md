# BatchPlane Delivery Roadmap

Status: Approved delivery order, reconciled 2026-10-05 in PR #192.
Scope: product direction and acceptance boundaries, not approval to implement
every API, table, permission or integration example in the architecture documents.

## Current Baseline

The reconciliation source is main commit
`35eb868396d85e80a1a7c81297e59a3a19e9ffb8`. The R1-R7 refactoring and subsequent
merged fixes are the starting point, not work to repeat.

Already present in Lite: shared product Pages and `BatchPlaneClient`, GitHub
adapter-owned evidence, registration/change/deletion requests, approval modes,
manual execution, native scheduled execution, Gate checks, execution logs,
deleted-Batch history, failure explanation and explicit manager review.
This is implementation availability, not a declaration that all flows pass QA.
Native schedule delivery still needs live GitHub evidence in #202. Known
authorization, parameter, lifecycle and query gaps remain below.

Main is not implemented. A Main fixture or proposed interface is not a working
Kotlin/MySQL edition. The current client contract is
[`packages/ui-client`](../packages/ui-client/src/index.ts); do not replace it
with speculative grouped interfaces solely to match an architecture diagram.

## Approved Order

Stage numbers are delivery positions, not milestone numbers or PR sizes.

| Stage | Work                                     | Issues / milestone                  | Exit condition                                                                                                                                                                         |
| ----- | ---------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Baseline documents and user QA           | PR #192 / M0-A; #232 / M1           | Current implementation, known gaps, planned requirements and design candidates are distinguished; requirements, issues and reusable QA are linked.                                     |
| 2a    | Lite approval consistency                | #223 / M0-R                         | Screen capability, actual approval command and Gate agree; approved-revision lookup is not truncated by the first 100 records (BF-7).                                                  |
| 2b    | Approved execution inputs                | #212 / M0-R                         | Approved parameter values reach the actual business command; recording or dispatch success alone is insufficient.                                                                      |
| 2c    | Request termination                      | #224 / M0-R                         | Expiry and confirmed dispatch failure terminate correctly and do not block valid new work; a failed dispatch requires a new request.                                                   |
| 2d    | Withdrawal and real cancellation         | #225 / M0-R                         | Approved withdrawal, queued cancellation and running stop have state-specific confirmation, authority checks, real provider effects and audit evidence.                                |
| 3     | Schedule and operating queries           | #206, #226 / M0-R                   | Cross-Batch schedule inventory/detail and cron preview agree with generated configuration (BF-3); older executions/audit and unresolved My Work remain accessible.                     |
| 4     | Unified requests and multiple Workspaces | #142 / M0-R                         | Authorized aggregate queries and one multi-Batch/multi-operation/multi-Workspace request; a common approver for every target is required.                                              |
| 5     | Lite acceptance                          | #65, #202 / M0-R; #232 evidence     | Existing and new core flows pass meaningful automated checks and user QA, including live native schedule/rerun evidence. Blocking correctness gaps are resolved.                       |
| 6     | Main basic model and contracts           | #227 / M2                           | Workspace, account, membership, authorization, platform connection and unified-request relationships are approved before API/MySQL contracts and code.                                 |
| 7     | Main registration and manual execution   | #228 / M4                           | Shared React UI through GitHub registration, approval, approved inputs, Gate, business execution, result/log/audit, request termination, withdrawal/cancel and result synchronization. |
| 8     | Early real Jenkins validation            | #231 stage A / M6                   | In the same Main Workspace, GitHub and Jenkins execute the first control flow through real integrations. This is not full Jenkins support.                                             |
| 9     | Remaining operations and platforms       | #228 / M4; #229 / M3; #231 B/C / M6 | Main change/delete/history, schedules/delay monitoring, failure follow-up/review, broader Jenkins support, and a separately selected third platform are validated.                     |
| 10    | Combined acceptance                      | #230 / M5; #231 / M6                | Reuse valid per-flow evidence to accept shared Lite/Main behavior, declared Jenkins support and real third-platform validation.                                                        |

Multi-Workspace work is Lite-first, not merely a Workspace switcher. If #142
has demonstrated Lite cost or feasibility constraints, present the evidence and
obtain user acceptance before deferral. It then becomes the first follow-up
product work after Main's first operating flow; coordinate its detailed order
with early Jenkins validation. Do not silently shrink it to read-only views.

Main model preparation may overlap Lite user-QA waiting. Main product code
starts only after Lite acceptance and model approval. No parallel implementation
or extra agents are authorized by this roadmap.

## Lifecycle Decisions That Must Not Be Lost

- A common approver must have approval authority for **all** operations and
  Workspaces in a unified request. Without one, request creation is blocked.
  One such person approves the entire request once. This is not collection of
  separate Workspace approvals.
- Approved work can be withdrawn by its requester, its approver, or a user with
  execution authority for the target. Detailed cancel-role mapping is designed
  in #225/#227, not inferred from the visibility of a button.
- Before delivery, withdrawal prevents execution. For a queued native attempt,
  offer explicit cancellation; for running work, explicitly ask to stop it.
  Do not present a stopped request while its business command continues.
- Cancellation sends an actual engine command. Terminal provider evidence wins
  if execution already finished; uncertainty is not fabricated completion.
  Preserve reason, actor, target and requested-versus-confirmed outcome.
- Confirmed execution delivery failure is terminal. The user creates a new
  request under current policy and inputs. No same-request retry-dispatch or
  automatic retransmission is part of the approved target. An unknown delivery
  outcome is not confirmed rejection.
- Result synchronization repairs stored observation from provider evidence; it
  does not execute or cancel work. It is required in Main's first flow.
  Separate Lite result-repair timing is not advanced by #225.
- Schedules use their approved owning Batch revision, not per-occurrence fake
  approvals. Delay can occur; no automatic catch-up or retry is approved.
  Backfill needs a separate later discussion.
- Main delay monitoring is required in #229. Lite must not fabricate expected
  times from worker start time to simulate a monitoring guarantee.

## Query And History Acceptance

A page size is not the total searchable history. A period/Batch query must find
records beyond the initially loaded page. Unresolved explanations and manager
reviews remain in My Work regardless of age. Partial/error responses must not
be shown as an empty or complete result.

Use bounded provider queries/pagination; this requirement does not authorize
unbounded loading, another search service or a cache. Provider-side deletion
and retention remain explicit limits, not product query omissions.

## QA And Delivery Discipline

[Requirements traceability](./requirements-traceability.md),
[the Korean user QA sheet](./user-qa.ko.md), and
[the QA result template](./qa-result-template.ko.md) are maintained with each
behavior-changing delivery. QA begins during each flow, not for the first time
at stage 5. Do not equate documents, code, automated checks, user QA, live
provider evidence, remote CI or merge.

- #119 remains open as the end-to-end UX checklist across Lite and Main.
- #65 covers deterministic browser flows; it cannot replace #202 live evidence.
- BF-4/BF-5 localization and UX-1 return-flow residuals require explicit impact
  and follow-up acceptance; known correctness failures cannot be waived silently.
- Shared behavior changes revalidate affected Lite/Main consumers. #230 is
  accumulated acceptance, not a demand to rerun every unaffected test combination.
- Documentation-only changes receive content, formatting, link and diff checks.
  They do not require application tests/builds.
- The user tracks remote CI and merges. Agents never merge into main.

## Release Track

#193 (license/security policy), #196 (immutable Action releases, update/rollback
and default-branch protection), and #68 (accurate use/contribution guidance)
belong to the first external-user release, including an early Lite release.
They do not block every feature change and must not wait for Main/Jenkins.
Decide licensing earlier if inviting external use or contributions.

Current development Action references do not satisfy #196 merely because a
document describes immutable releases. Keep release readiness separate from
functional readiness.

## Architecture Detail Still Requiring Approval

Hexagonal boundaries, Kotlin/Spring Boot, MySQL, one source repository and shared
React UI are accepted. Exact Main IDs, endpoints, schema/table layout, principal
mapping, connector authentication, jobs/plugins and deployment packaging require
#227/#228/#231 design approval. Do not pre-create empty modules or a generic SDK.

Earlier #192 requirements for native-resource discovery/onboarding, audit export,
external notification channels and failure recurrence analysis retain their
original IDs and priority. Their detailed scope and placement in this roadmap
need owner confirmation. Pending clarification is not a downgrade to optional
features or authorization to omit them from a release. No new delivery stage is
silently assigned, and no implementation is claimed.
