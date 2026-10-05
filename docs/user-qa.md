# BatchPlane User QA Sheet

[한국어](./user-qa.ko.md)

Baseline date: 2026-10-05. Main baseline: `35eb868396d85e80a1a7c81297e59a3a19e9ffb8`.
This is a #232 deliverable, **not a report that the product has been validated**.
All 27 cases start with user result `NOT_TESTED`. Record subsequent version
results separately using the [result template](./qa-result-template.md).

## How To Use

Check actual business journeys, not unlimited combinations per feature. When
repeating a common procedure in Main/Jenkins, record its existing case ID and
environment instead of duplicating the case. Neither automated test counts nor
this sheet's case count is a quality target.

| Implementation readiness | Meaning                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `AVAILABLE`              | The relevant feature exists and can be checked by the user. This does not mean it passed.        |
| `KNOWN_GAP`              | A known correction remains. Partial checks are possible, but a complete pass cannot be recorded. |
| `PLANNED`                | Confirmed follow-up scope. Do not look for nonexistent buttons or assume it works.               |
| `DESIGN_REQUIRED`        | Finalize executable procedures after detailed model/UX/integration approval.                     |

Record one of `NOT_TESTED / PASS / FAIL / BLOCKED / RETEST_REQUIRED / N/A`.
`N/A` needs an edition/support-scope reason; do not hide missing implementation
as N/A. Link causes and issues for `BLOCKED` and `FAIL`. If a change affects the
validity of a previous PASS, record `RETEST_REQUIRED` in a new session without
overwriting the old result. Readiness and result are separate columns.

## Safe Preparation

- Use a user-authorized test Workspace/repository, not production Batches.
  Live GitHub writes, execution and cancellation require separate authorization
  for the actual test environment at execution time.
- Prepare requester A, eligible approver B and unauthorized user C. Manager
  review must be performed by an authorized manager. One account can test
  self-approval, but cannot establish a pass for separation of duties or denial
  of unauthorized users.
- Use commands without external business effects: `printf 'QA_OK\n'` for success,
  `exit 7` for failure and `sleep 120` for cancellation. Cancellation is not rollback.
- Distinguish Batch IDs such as `qa-success`, `qa-failure`, and `qa-cancel`.
  An unexecuted sample is not evidence. After #212 inputs and #225 cancellation
  are implemented, update this sheet with their approved inputs and screen steps.
- Record app commit/build, Action SHA, target repository/default branch,
  Workspace policy, user roles and browser/locale/viewport. Do not retain tokens
  or sensitive logs.
- Separate UI observations, automated results and actual GitHub execution,
  comment and PR evidence. Mocks cannot pass #202; remote CI cannot replace user QA.

## Lite Core Flows

### QA-L01: Connection And Installation Status Follow The Actual Repository

Readiness: `AVAILABLE`. Connection/installation/update, sessionStorage.

Steps: Enter the dedicated repository and token in Workspace and check the
connection. If uninstalled, create an installation request and open its returned
detail. Recheck after user approval/application. In an environment with old
managed files, inspect the update request's change scope. Then edit connection
values or disconnect; check that old inspection and in-flight results are not reused.

Expected: Saving, verifying, requesting installation and actual application are
distinct. Installation/policy commands cannot run with an unverified connection
and show why. Tokens do not remain in localStorage or reappear in UI/storage
after disconnection. Never include the token in test evidence.

### QA-L02: Approved Registration Content Reaches The Batch And Execution Files

Readiness: `AVAILABLE`. Also check remaining authorization consistency in QA-L05.

Steps: A enters a unique ID, name, environment, `runs-on` and Batch command.
Attach a safe file only when testing file execution. Check blank and explicit
owners in the relevant paths, preview and submit. B reviews the detail and approves.

Expected: Creation immediately opens internal detail. Nothing is applied before
approval; approved command, runtime/file and `{batchId}.yml` paths are applied.
Gate is always mandatory. Blank owner becomes the real requester before preview
and digest calculation; explicit owner is preserved. Detail links to the Batch.
The PR link is secondary evidence.

### QA-L03: Changes And Schedule Add/Edit/Delete Share One Request And Real Diff

Readiness: `AVAILABLE`, with the cron consistency `KNOWN_GAP` in QA-L16.

Steps: Open change writing for an existing Batch. Verify current values are
filled, change the command and a schedule, and delete another schedule. Compare
old/proposed values in preview and request detail. Check the original before
approval and applied result afterward.

Expected: The page is not an empty registration form. Real changed fields and
removed schedules appear in the diff, not a false "No changes". Batch detail
does not directly save schedules. Preview deletion is a proposed change, not
deletion before approval. Changed request content cannot reuse the old approval.

### QA-L04: Deleted Batches Retain Access To Historical Revisions, Executions And Explanations

Readiness: `AVAILABLE`.

Steps: Submit deletion for a test Batch with execution and failure-explanation
history. Check before/after approval, then open its existing execution, audit
and historical Batch links after deletion.

Expected: Deletion applies after approval. Preserved executing configuration,
including command/schedules, and original requests/explanations remain accessible.
Deleted Batches are not offered for new execution. Missing source due to GitHub
retention/permissions is distinguished from no records.

### QA-L05: Approval UI, Actual Command And Gate Make The Same Authorization Decision

Readiness: `AVAILABLE` after the #223/BF-7 correction. Owner/provider QA remains
NOT_TESTED until a versioned result is recorded.

Steps: Inspect A's request with the actual roles of A/B/C. Apply blocked,
self-approval-allowed and automatic policies and check affected representative
flows. Check both unauthorized denial and eligible approval. Use prepared history
fixtures or a dedicated environment to retrieve/verify approval evidence beyond
100 records; do not manually create 100 records each time.

In both the approvals inbox and request detail, check the distinct disabled
approval/rejection reasons for an ineligible actor and unavailable authorization
lookup. The request remains readable. Use deterministic fixtures for missing role
mapping, stale draft mode, mismatched/edited comments and a failed continuation
page; do not alter a real operating repository merely to simulate these conditions.

Expected: Relaxed modes do not grant missing approval authority. Blocked mode
denies self-approval; allowed/automatic modes permit eligible self-approval.
Automatic approval has separate policy evidence. Button, command and Gate agree
and valid approvals beyond page one are found. Revalidate this flow against the
corrected version; automated checks do not carry forward an owner QA pass.

Expected evidence: a later-page decision is considered, including a later valid
rejection, and an incomplete history remains unavailable rather than absent.
Actual comment author and subject digest identify the decision. Automated fixture
results, browser checks and owner/provider QA are recorded separately by version.

### QA-L06: Approved Parameters Become Actual Business Command Inputs

Readiness: `KNOWN_GAP` #212.

Steps: Prepare a test Batch accepting non-secret `qa-value-1` under the input
contract to be approved in #212. Compare preview/request/approval with actual
business output. Check an attempt to execute different values after approval
through that contract's validation path.

Expected: The actual command uses the approved value, not merely a UI record or
successful dispatch. Unapproved values do not execute. Sensitive values are not
recorded verbatim. Automatic approval also shows latest request state and links
to the correlated **execution detail**.

### QA-L07: Real Native Scheduling Uses The Approved Revision And Correlates Its Result

Readiness: `AVAILABLE`; actual GitHub evidence pending #202.

Steps: In a dedicated repository, register/approve a near-future cron and IANA
timezone through a Batch change request. Record source workflow/default branch
and configured local time. Wait for an actual `schedule` event, not a manual
button. Inspect occurrence request, original change approval, Gate, business job
and result. With multiple schedules, use a dedicated case to confirm that one
schedule's failure is not copied to another's result.

Expected: Processing stays in the same native execution without per-occurrence
human/automatic approval comments or a second dispatcher execution.
`repositoryId/batchId/scheduleId/sourceRunId` and actual attempt/job match.
Business runs from the verified SHA. Record delay/absence honestly; manual
execution is not cron proof. Do not infer expected time from worker time. See
the [schedule contract](./schedule-execution-contract.md) for live conditions.

### QA-L08: Direct Execution And Full/Partial Reruns Cannot Bypass Gate

Readiness: `AVAILABLE`; native schedule live evidence pending #202.

Steps: On a dedicated Batch, attempt an unrequested native manual start, a rerun
of successful manual execution, a scheduled full rerun and a business-only
partial rerun through supported paths. Also verify a separately authorized
normal execution so blanket denial is not mistaken for success.

Expected: Reused/missing authority cannot execute business commands. History
records the attempt and blocking reason. Skipping control jobs does not bypass
business-entry verification. Do not claim complete duplicate prevention for the
same nominal slot across different native Runs.

### QA-L09: Unapproved Configuration Is Blocked And Recovered Through A Formal Change Request

Readiness: `AVAILABLE`. No direct edits outside the test repository.

Steps: Externally change approved files in a test copy of an approved Batch.
Check UI status, request availability and Gate denial. Use a supported formal
repair/change request, review/approve again, then request a new execution.

Expected: Unapproved content cannot execute. Recovery neither erases original
history nor attaches old approval to a new revision. Unavailable detection or
approval evidence is not confused with health. This does not guarantee control
after an administrator removes the system itself.

### QA-L10: Expiry And Confirmed Delivery Failure End The Request And Allow New Work

Readiness: `PLANNED` #224. Existing retry-dispatch is a known policy mismatch.

Steps: After design/implementation, create expiry and **confirmed** delivery
rejection using dedicated fixtures. Check detail and availability of the next
change/execution request. Separately check a response with unknown delivery
acceptance.

Expected: Expiry/failure does not indefinitely block valid work. Confirmed
delivery failure starts again through a new request/current policy, without
same-request retransmission or automatic rerun. Uncertain delivery is not
converted to confirmed failure or automatically resent.

### QA-L11: Withdrawal, Queued Cancellation And Running Stop Match The Real Engine

Readiness: `DESIGN_REQUIRED` #225. Finalize actual screen steps after permission/UX approval.

Steps: Check the approved withdrawal/cancel flow for an approved undelivered
request, provider queue, running `sleep 120` and already-terminal work. Verify
undelivered withdrawal by requester, actual approver and target-execution user,
and deny unauthorized users. Record confirmation/reason and actual provider
cancellation for queued/running work. Check terminal/uncertain response display.

Expected: Undelivered withdrawal is enforced by delivery/Gate too. Queued work
uses explicit cancellation; running work asks for stop confirmation. No UI-only
termination without a real command. Preserve actual terminal results; inability
to confirm is not completed termination. Cancel does not undo effects. Mixed
targets cannot appear wholly withdrawn while some work still executes.

### QA-L12: Execution Detail And Business/Full Logs Point To The Exact Target

Readiness: `AVAILABLE`.

Steps: Open success, `exit 7` failure and Gate-blocked executions from history.
Reach the same execution from request detail, failures and audit. Switch default
and full logs; while navigating between executions, verify old log responses do
not contaminate the new screen.

Expected: A known Batch is not called "Unknown batch". Default logs cover the
actual Batch command; full logs include preparation/Gate. Blocking differs from
business failure. Overall native conclusions are not copied to another
schedule/job/attempt. Retention expiry and permission errors are explicit;
application logs do not record tokens.

### QA-L13: Business Failure Explanation Closes Through Manager Review And Correction

Readiness: `AVAILABLE`.

Steps: Produce a business failure. The manual requester or executing scheduled
revision's owner submits explanation/actions. Request corrections in manager
review, resubmit and approve. Additionally check rejection when affected by the
change. Check eligible manager self-review under allowed policy, but never allow
AUTO_APPROVE to close the case immediately after submission.

Expected: Submission and review decision/reason remain separate. My Work routes
the next task to its responsible user. Ownership alone grants no permissions.
Past submissions/corrections/reviews remain. Do not force business-failure
explanations on Gate-blocked attempts.

### QA-L14: Old Executions, Audit And Unresolved Work Remain Within Query Scope

Readiness: `KNOWN_GAP` #226.

Steps: In prepared history beyond first-page/recent limits, find an old Batch by
period and Batch filters. Open old unresolved explanations/reviews in My Work.
Distinguish next-page failure from unavailable provider source.

Expected: Filtering only the latest subset is not presented as a complete query.
Old unresolved items remain accessible. Partial/error responses are not "none"
or "complete". Unlimited loading/new caches are not required. Distinguish source
retention limits from product omissions.

### QA-L15: Creation And Approval Show Latest State In Internal Detail And Lists

Readiness: `AVAILABLE`.

Steps: Create one registration/change/execution request and inspect returned
detail, approvals/request lists and refresh. Check automatic-approval state and
correlated execution detail too. If preceding work blocks creation, open that
request's internal detail.

Expected: The journey does not force work to continue in GitHub. Successful
responses do not leave old state inviting duplicate approval. If native execution
has not been found, show that confirmation is pending rather than infer failure
or completion. Do not invent a seconds-level response guarantee without agreement;
record request/response timestamps when reproducing a delay.

### QA-L16: Cross-Batch Schedule Inventory Agrees With Input, Preview And Generation

Readiness: `PLANNED` #206; cron consistency BF-3 is a known correction.

Steps: Find active/inactive schedules across Batches and navigate detail ->
Batch -> approval authority -> execution history. Compare upcoming times for
supported cron/timezones across input, preview and generated workflow. Confirm
unsupported forms are rejected before submission.

Expected: Users need not open every Batch to inspect schedules. Editing from
inventory leads to a Batch change request. Fixed UTC conversion does not change
IANA semantics. Expected time is not guaranteed execution and differs from
delayed/missing events.

### QA-L17: Aggregate Workspaces And Approve Unified Requests With One Common Approver

Readiness: `DESIGN_REQUIRED` #142.

Steps: After detailed design approval, include several Batches/operation types
from different Workspaces in one request. Check creation with and without a user
authorized to approve all targets. Check unauthorized Workspace reads/item
addition, whole-request common approval, item results and mixed-state withdrawal.

Expected: A Workspace switcher is insufficient. No common approver means no
creation; otherwise one person approves the whole request once. No independent
Workspace approval collection. Request approval and item processing outcomes
remain distinct, without unauthorized data exposure. Lite deferral requires
evidence/user acceptance and is not completion.

### QA-L18: Key Screens And Next Actions Remain Readable In Both Languages And On Mobile

Readiness: `AVAILABLE`. #119 stays an open checklist.

Steps: Check the changed list -> writing -> detail -> approval/execution/
explanation journey in English/Korean, desktop/390px and keyboard navigation.
Check initial locale, preserved input during language changes, and relevant
loading/error/empty/disabled states and reason tooltips.

Expected: No unnecessary Gate cards/options, overlap/overflow or dead ends.
Primary actions finish in the product; source links are secondary. Do not
translate technical IDs or change business meaning/state by language. Do not
repeat every unaffected screen each time.

## Main And Real Multi-Platform Acceptance

### QA-M01: Approve The Workspace, Account, Permission And Connection Model First

Readiness: `DESIGN_REQUIRED` #227. Design acceptance, not a UI execution test.

Steps: The user reviews accounts/external identities/membership/permissions,
Workspaces with multiple connections, unified requests/common approver,
withdrawal/cancel authority, identifier relationships and draft MySQL/API design.

Expected: External authentication facts differ from product authorization;
Workspace is not tied to a platform. Do not freeze unapproved models in code.
Keep review/approval links without describing them as Main feature-test passes.

### QA-M02: Complete Main's First GitHub Operating Flow Through The Same UI

Readiness: `PLANNED` #228, after QA-M01 approval and Lite acceptance.

Steps: On real Kotlin/MySQL and GitHub, execute QA-L02/L05/L06/L10/L11/L12/L15
under the applicable Main contract. Connect request -> approval -> inputs ->
Gate -> business -> result/log/audit.

Expected: Real business inputs and cancellation outcomes are visible, not just
a mock or successful connection. UI does not depend on GitHub DTOs/tokens;
API/Gate recheck authority. Main provider secrets are not returned to browsers.
Record each case's Main result separately.

### QA-M03: Result Synchronization And Actual Stop Are Different Commands

Readiness: `PLANNED` #228, required in Main's first flow.

Steps: Synchronize a dedicated case completed at the provider but missing its
product result. Stop another actually running case with a reason. Also exercise
unavailable provider status under the agreed contract.

Expected: Synchronization repairs confirmed results without new execution or
cancel. Stop sends a real cancel and corrects to the actual result if already
finished. Uncertainty is not fabricated success/failure/completed cancellation.
Keep actor, reason and outcome of the two commands separate.

### QA-M04: Connect Main Change, Deletion, Failure Review And History Queries

Readiness: `PLANNED` #228.

Steps: Execute QA-L03/L04/L13/L14 in Main and check apply conflict/failure.

Expected: Approved change differs from actual apply result. Deleted history,
explanation/manager review and old unresolved work remain. Approval UI does not
require understanding raw GitHub PR content.

### QA-M05: Main Schedule Operations And Delay Monitoring Follow Actual Evidence

Readiness: `PLANNED` #229.

Steps: Execute QA-L07/L08/L16 in Main. Compare delay with trustworthy expected/
observed times against unknown expected time. Open original approval/results
from authorized Batch inventory.

Expected: Approved-revision unattended execution and Gate persist, with delay
monitoring. Do not invent unknown expected times or execute missed occurrences
in a catch-up burst.

### QA-P01: Validate Real GitHub And Jenkins In The Same Main Workspace

Readiness: `DESIGN_REQUIRED` #231 A, immediately after Main's first GitHub flow.

Steps: Configure both connections in one Workspace under the approved Jenkins
integration and Job scope. Exercise common registration/approval/inputs/
execution/Gate/results/logs/synchronization/stop on both.

Expected: Provider details remain in adapters; policy meaning matches. Prove
actual Gate coverage for direct starts/reruns. Do not wait for all Main features.
This is early proof, not full Jenkins support acceptance.

### QA-P02: Validate Broader Jenkins Support And The Selected Third Platform

Readiness: `DESIGN_REQUIRED` #231 B/C.

Steps: Apply QA-M04/M05 to approved Jenkins change/delete/schedule/failure-review
scope. Test actual execution/scheduling/control differences on the separately
selected and approved third platform.

Expected: Do not automatically select the example SCDF. Correct only necessary
common contracts/adapters based on actual differences. Record versions, Job
types, permissions, limits and evidence. API connections or mocks just to count
platforms are not acceptance evidence.

### QA-X01: Accept Shared Lite/Main Meaning And Intentional Differences From Accumulated Evidence

Readiness: `PLANNED` #230.

Steps: Compare per-flow Lite/Main results, documenting differences in shared
UI/authorization/Gate/audit semantics, supported scope and retention limits.
Revalidate only cases affected by changed common contracts.

Expected: Reuse valid evidence without hiding failures in different versions/
environments. GitHub and MySQL implementations do not invent separate product
policies. Writing documents does not pass undecided design or unverified live scope.

### QA-R01: First External-Release Guidance Matches Actual Use, Security And Artifacts

Readiness: `PLANNED` #193/#196/#68.

Steps: Compare license/security-reporting/contribution guidance, immutable
Action references, protections, update/rollback procedures and supported
versions with actual release artifacts.

Expected: Development `@main` is not described as a production-pinned version.
Resolve undecided licensing before encouraging public use. This applies to the
first external Lite release, not only after Main/Jenkins. Do not choose license
types or detailed policies without user decisions.

## Revalidate Code Changes To The Same Standard

For each PR, record changed contracts/screens, affected QA IDs, environment/
version, automated checks versus user results and remaining defects. This table
is a minimum selection guide, not an instruction to rerun everything.

| Changed area                                 | Flows to revalidate                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Connection/installation/policy/authority     | QA-L01, QA-L05, affected requests and QA-L18                                |
| Batch definition/change/diff/deletion        | QA-L02, QA-L03, QA-L04, approved-revision check QA-L09                      |
| Request/approval/dispatch/input              | QA-L05, QA-L06, QA-L08, QA-L10, QA-L15                                      |
| Withdrawal/real cancellation/synchronization | QA-L10, QA-L11, QA-M03 and actually affected providers                      |
| Cron/schedule/Gate/evidence                  | QA-L07, QA-L08, QA-L09, QA-L12, QA-L16; QA-M05 for Main                     |
| Execution/logs/explanation/query scope       | QA-L04, QA-L12, QA-L13, QA-L14, QA-L15                                      |
| Unified requests/Workspace/permission scope  | QA-L05, QA-L11, QA-L17; QA-M01 for Main model                               |
| Shared UI/routing/i18n                       | Applicable business cases and QA-L18; QA-X01 if both editions are affected  |
| Common contracts/Main/provider               | Applicable Lite cases + affected QA-M02~M05/QA-P01~P02                      |
| Release/deployment/user guidance             | QA-R01 and installation/execution cases affected by artifacts               |
| Documentation only                           | Content/link/ID/format checks. Do not record new product-test PASS results. |

Revalidate fixes with the same case ID and preserve the previous failure.
Record document version if preconditions/expectations changed. Obtain user
approval for scope-expanding design rather than hiding it in validation edits.
Consult #119 for each screen change; neither this sheet nor one PR closes it.
