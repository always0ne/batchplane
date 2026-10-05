# Requirements, Roadmap And QA Traceability

Baseline: 2026-10-05, main `35eb868396d85e80a1a7c81297e59a3a19e9ffb8`.
Ownership reflects the live open-issue inventory reconciled under #232.
This is delivery traceability, not evidence that every requirement is implemented
or tested. [Roadmap](./control-plane-migration-plan.md) controls sequence;
[SRS](./control-plane-srs.md) controls product meaning.

## Reading The Matrix

- **Present / gap**: current Lite has the flow, but listed corrections and QA
  remain. This does not mean all clauses in the group already pass.
- **Planned**: approved scope, implementation not delivered.
- **Design required**: detailed model/UX/API/provider decisions still need approval.
- **Scope confirmation pending**: an older proposal is preserved, not newly
  accepted or silently deleted. No executable QA is claimed for it yet.
- ID ranges below include both endpoints. Groups intentionally share workflow
  QA; they are not a demand for one test per ID.

All QA references point to [the Korean QA sheet](./user-qa.ko.md). A preparation
state is not a test result; the [result template](./qa-result-template.ko.md)
starts every case NOT_TESTED. Main and provider-design rows are not clickable
current features.

## Product Requirements

| Requirement IDs          | Observable scope                                                                                | Work / timing                                              | Readiness                                                      | QA                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| CP-WSP-001..CP-WSP-009   | Identity, Workspace scope, multiple connections, credentials and authorized aggregate operation | #142; #227 before #228; current single connection retained | Present single connection; multi/Main design required          | QA-L01, QA-L17, QA-M01, QA-M02                                         |
| CP-PRV-001..CP-PRV-007   | Actual capability, installation, normalized errors and provider verification                    | #227/#228, early and full #231                             | Lite partial; Main/provider design required                    | QA-L01, QA-L18, QA-M01, QA-P01, QA-P02                                 |
| CP-PRV-008               | Immutable production connectors and controlled update                                           | #196, first external release                               | Planned; development refs are not release proof                | QA-R01                                                                 |
| CP-BAT-001..CP-BAT-003   | Product Batch identity independent of native IDs, integrated catalog                            | #142/#227/#228/#231                                        | Single-provider present; multi/Main design required            | QA-L02, QA-L17, QA-M01, QA-P01                                         |
| CP-BAT-004..CP-BAT-006   | Native discovery/classification/onboarding                                                      | Earlier #192 proposal; scope decision retained in #232     | Scope confirmation pending                                     | Not assigned until scope decision                                      |
| CP-BAT-007..CP-BAT-008   | Effective configuration/history and deletion continuity                                         | Existing Lite; #226/#228/#229                              | Present with history-query gap                                 | QA-L02, QA-L04, QA-L12, QA-L14, QA-M04                                 |
| CP-CHG-001..CP-CHG-009   | Controlled changes, real diff, stale approval and native apply result                           | Existing Lite; #223/#228/#231                              | Present Lite; Main planned                                     | QA-L02, QA-L03, QA-L04, QA-L09, QA-M04, QA-P02                         |
| CP-APR-001..CP-APR-010   | Product authority, effective policy, default/relaxed modes and decision evidence                | #223 then #227/#228                                        | Known Lite consistency/lookup gap; Main design required        | QA-L01, QA-L05, QA-L09, QA-L13, QA-M01, QA-M02                         |
| CP-EXE-001..CP-EXE-004   | Exact manual inputs/authority, safe secret handling and trigger context                         | Existing Lite; #212/#228                                   | Present request; end-to-end input gap                          | QA-L05, QA-L06, QA-L07, QA-M02                                         |
| CP-EXE-005..CP-EXE-006   | Scope-bound Main execution admission                                                            | #227/#228                                                  | Design required; permit representation not frozen              | QA-M01, QA-M02, QA-P01                                                 |
| CP-EXE-007..CP-EXE-008   | No reused rerun authority; confirmed delivery failure ends request                              | #224; native verification #202; Main #228                  | Native checks present; failed-request retry mismatch pending   | QA-L08, QA-L10, QA-M02                                                 |
| CP-EXE-009               | Approved values reach the actual command                                                        | #212, before Main; #228/#231                               | Known gap                                                      | QA-L06, QA-M02, QA-P01                                                 |
| CP-EXE-010               | Expiry and terminal failure release valid next work                                             | #224                                                       | Planned correction                                             | QA-L10                                                                 |
| CP-EXE-011..CP-EXE-012   | Approved withdrawal and real queued/running cancellation                                        | #225 before Lite acceptance; #227/#228/#231                | Detailed authority/UX required                                 | QA-L11, QA-L17, QA-M02, QA-P01                                         |
| CP-EXE-013               | Observation repair independent of cancel                                                        | #228 first Main flow; #231                                 | Planned; Lite additional timing separate                       | QA-M03, QA-P01                                                         |
| CP-SCH-001..CP-SCH-009   | Owning revision authority, native occurrence/Gate/result identity                               | Existing native Lite contract; #202 live; #229/#231        | Implemented Lite, live acceptance pending                      | QA-L03, QA-L07, QA-L08, QA-L09, QA-M05, QA-P02                         |
| CP-SCH-010               | Honest delay/duplicate boundaries; no automatic catch-up                                        | #202/#229/#231; separate later backfill discussion         | Current policy; actual provider constraints need proof         | QA-L07, QA-L08, QA-M05, QA-P02                                         |
| CP-SCH-011..CP-SCH-012   | Cross-Batch schedule queries and consistent cron preview/generation                             | #206, including BF-3; Main #229                            | Planned inventory / known cron gap                             | QA-L03, QA-L16, QA-M05                                                 |
| CP-SCH-013               | Main schedule-delay monitoring with trustworthy timing                                          | #229                                                       | Planned                                                        | QA-M05                                                                 |
| CP-GAT-001..CP-GAT-011   | Mandatory pre-business checks, evidence, direct/rerun block and actual result                   | Existing Lite; #223/#202; #228/#229/#231                   | Lite present with named gaps/live proof pending; Main planned  | QA-L05, QA-L07, QA-L08, QA-L09, QA-L12, QA-M02, QA-P01, QA-P02         |
| CP-RUN-001..CP-RUN-006   | Exact execution outcomes, native logs and uncertain observation                                 | Existing Lite; #228/#229/#231                              | Present Lite; Main planned                                     | QA-L04, QA-L07, QA-L12, QA-M02, QA-M03, QA-P01                         |
| CP-RUN-007               | Older execution/audit queries are complete beyond page one                                      | #226, then Main query acceptance                           | Known gap                                                      | QA-L14, QA-M04                                                         |
| CP-RUN-008               | Exact detail/history links and business/full log region                                         | Existing Lite; #228/#231                                   | Present Lite                                                   | QA-L04, QA-L12, QA-L15, QA-M02                                         |
| CP-FAL-001..CP-FAL-002   | Business-failure explanation, action and responsible owner                                      | Existing Lite; #228/#231                                   | Present Lite; Main planned                                     | QA-L07, QA-L13, QA-L14, QA-M04, QA-P02                                 |
| CP-FAL-003               | Configurable cause taxonomy for recurrence reporting                                            | Earlier #192 proposal; scope decision retained in #232     | Scope confirmation pending                                     | Not assigned until scope decision                                      |
| CP-FAL-004..CP-FAL-005   | Explicit manager review and separate preserved decision                                         | Existing Lite; #228/#231                                   | Present Lite; Main planned                                     | QA-L05, QA-L13, QA-L14, QA-M04, QA-P02                                 |
| CP-FAL-006               | Failure recurrence reports                                                                      | Earlier #192 proposal; scope decision retained in #232     | Scope confirmation pending                                     | Not assigned until scope decision                                      |
| CP-AUD-001..CP-AUD-004   | Actor, decisions, mutation/result correlation and preserved evidence                            | Existing Lite; #224/#225/#226/#228                         | Present with lifecycle/query gaps; Main planned                | QA-L04, QA-L05, QA-L07, QA-L10, QA-L11, QA-L13, QA-L14, QA-M02, QA-M03 |
| CP-AUD-005               | Audit export                                                                                    | Earlier #192 proposal; scope decision retained in #232     | Scope confirmation pending                                     | Not assigned until scope decision                                      |
| CP-AUD-006               | Honest deployment retention and evidence limits                                                 | #227/#228 design; #68 release scope                        | Main design required; no default compliance claim              | QA-L04, QA-L12, QA-M01, QA-R01                                         |
| CP-AUD-007               | Lite evidence projection with source references                                                 | Existing Lite; #226/#202 acceptance                        | Present with query/live gaps                                   | QA-L07, QA-L12, QA-L14, QA-L15                                         |
| CP-NOT-001               | Old unresolved work stays actionable in My Work                                                 | #226; #228                                                 | Known query gap                                                | QA-L13, QA-L14, QA-M04                                                 |
| CP-NOT-002..CP-NOT-005   | External notification delivery/channels/deep links                                              | Earlier #192 proposal; scope decision retained in #232     | Scope confirmation pending                                     | Not assigned until scope decision                                      |
| CP-UI-001..CP-UI-008     | Shared product Pages/client, provider-neutral routes, capability, i18n                          | Existing refactoring baseline; #119 ongoing, #65/#230      | Shared boundary present, real Main conformance planned         | QA-L15, QA-L18, QA-M02, QA-X01                                         |
| CP-MAIN-001..CP-MAIN-006 | Kotlin/Spring, MySQL, transactional state/audit and safe external effects                       | #227 then #228                                             | Approved direction; concrete model/design pending              | QA-M01, QA-M02, QA-M03                                                 |
| CP-NFR-001..CP-NFR-006   | Idempotency limits, evidence/security and scoped access                                         | #223/#224/#225/#227/#228/#231                              | Existing Lite controls; remaining gaps and Main design pending | QA-L01, QA-L05, QA-L08, QA-L09, QA-L10, QA-L11, QA-L17, QA-M01, QA-P01 |
| CP-NFR-007..CP-NFR-008   | Provider availability/lag and deployment operating profile                                      | #227/#228/#229; #68 release documentation                  | Design required; no invented availability target               | QA-L07, QA-L14, QA-M01, QA-M05, QA-R01                                 |
| CP-REQ-001..CP-REQ-004   | Unified request, common approver, item outcomes and future request URLs                         | #142; model #227                                           | Design required                                                | QA-L11, QA-L17, QA-M01                                                 |
| UR-01..UR-10             | Detailed agreed unified-request intent, including cross-Workspace scope                         | #142; #227                                                 | Product direction approved, detailed UX/contract pending       | QA-L17, QA-M01                                                         |

## Open Work Inventory

Issue links point to current work, not a declaration that it is delivered.
Closed historical refactoring issues are not reopened or duplicated.

| Work                                                        | Current milestone / route through roadmap   | Completion evidence                                                             |
| ----------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| [PR #192](https://github.com/always0ne/batchplane/pull/192) | M0-A, stage 1                               | Reconciled docs, no new product implementation                                  |
| [#232](https://github.com/always0ne/batchplane/issues/232)  | M1, stage 1 and maintained with changes     | Traceability, QA sheet/result template, impact selection; not completed user QA |
| [#223](https://github.com/always0ne/batchplane/issues/223)  | M0-R, 2a                                    | QA-L05 including BF-7                                                           |
| [#212](https://github.com/always0ne/batchplane/issues/212)  | M0-R, 2b                                    | QA-L06 actual approved runtime values                                           |
| [#224](https://github.com/always0ne/batchplane/issues/224)  | M0-R, 2c                                    | QA-L10 terminal/new-request behavior                                            |
| [#225](https://github.com/always0ne/batchplane/issues/225)  | M0-R, 2d                                    | QA-L11 real cancellation, not only UI state                                     |
| [#206](https://github.com/always0ne/batchplane/issues/206)  | M0-R, 3                                     | QA-L16 and BF-3                                                                 |
| [#226](https://github.com/always0ne/batchplane/issues/226)  | M0-R, 3                                     | QA-L14 beyond first-page evidence                                               |
| [#142](https://github.com/always0ne/batchplane/issues/142)  | M0-R, 4; conditional approved deferral only | QA-L17; deferral is not completion                                              |
| [#65](https://github.com/always0ne/batchplane/issues/65)    | M0-R, per-flow and 5                        | Deterministic browser journeys, not live schedule proof                         |
| [#202](https://github.com/always0ne/batchplane/issues/202)  | M0-R, 5                                     | QA-L07/L08 real native schedule/rerun evidence                                  |
| [#227](https://github.com/always0ne/batchplane/issues/227)  | M2, 6                                       | QA-M01 approved basic model before code                                         |
| [#228](https://github.com/always0ne/batchplane/issues/228)  | M4, 7 and 9                                 | QA-M02/M03 first flow, QA-M04 broader operations                                |
| [#229](https://github.com/always0ne/batchplane/issues/229)  | M3, 9                                       | QA-M05 schedule/delay operation                                                 |
| [#231](https://github.com/always0ne/batchplane/issues/231)  | M6, 8/9/10                                  | QA-P01 early Jenkins; QA-P02 full declared scope and selected third platform    |
| [#230](https://github.com/always0ne/batchplane/issues/230)  | M5, per-flow and 10                         | QA-X01 accumulated shared behavior evidence                                     |
| [#119](https://github.com/always0ne/batchplane/issues/119)  | Ongoing, no closing milestone               | QA-L18 and affected flow, stays open                                            |
| [#193](https://github.com/always0ne/batchplane/issues/193)  | M0-S, first external release                | QA-R01 license/security policy                                                  |
| [#196](https://github.com/always0ne/batchplane/issues/196)  | M0-S, first external release                | QA-R01 immutable releases/update/rollback/protection                            |
| [#68](https://github.com/always0ne/batchplane/issues/68)    | M0-S, first external release                | QA-R01 accurate supported use/contribution guidance                             |

## Coverage Maintenance

When behavior changes, update the relevant requirement and readiness row, case
preconditions/steps/observable outcome, and issue evidence. Use the QA sheet's
change-impact table to select revalidation. Preserve previous failed results
and record the fixing commit, environment and new evidence.

BF-3 and BF-7 are tracked by #206/#223. BF-4/BF-5 localization and UX-1 return
flow residuals may be accepted only with explicit impact and follow-up; #119
remains open. Do not close #202 because a workflow was generated or a mock passed.

The unconfirmed older proposals remain visible in both SRS and this matrix.
Their scope decision must precede concrete issue placement and executable QA.
This pending clarification does not reopen the 13 agreed roadmap agenda decisions.
