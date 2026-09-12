# Schedule Execution Contract

R4 uses approved Batch revisions to authorize unattended schedule execution.
This contract covers the GitHub Lite implementation and provider-neutral UI
meaning. It does not introduce a separate scheduler, database or evidence branch.

## Execution Path

```text
Approved governed Batch revision (including schedules)
  -> native GitHub schedule Run
  -> request record and Gate decision
  -> business-entry verification of current authority and source attempt
  -> approved-SHA checkout and batch command
  -> result evidence for that schedule's jobs and attempt
```

The execution Issue records an occurrence; the original governed-change PR
remains its approval authority. No `SCHEDULE_DELEGATED` approval is fabricated
per occurrence, and no scheduled request is dispatched into another Run.
Manual request, approval and dispatcher behavior remains separate.

New scheduled payloads identify `spec.contractVersion: NATIVE_SCHEDULE_V2` and
omit manual `expiresAt` and inferred `scheduledAt`. The occurrence request ID
uses the full SHA-256 canonical tuple digest, not truncated identifiers. Both
Gate and result recording verify the exact target Issue and canonical payload;
a matching request ID or supplied Issue number alone is insufficient.

Gate reuses the existing approved-Batch-revision verifier. The active Batch,
enabled schedule, workflow path/source, actual event, cron mapping and approved
artifact digests must agree. A text field claiming `SCHEDULE`, a bot author,
an Issue or a copied comment does not prove authority. Business entry repeats
the applicable source/attempt and current-authority checks before the command,
even when successful upstream Gate outputs survive a partial rerun. Checkout
uses the verified revision SHA, never a moving branch.

The controller and recorder may have Issue-write permission. The business job
has only the reads needed for verification and checkout; it does not receive
Issue-write permission for the command.

## Identity And Time

The adapter derives the occurrence identity from the canonical tuple:

```text
(repositoryId, batchId, scheduleId, sourceRunId)
```

Actual run attempt and job identifiers accompany the evidence but do not mint
a new occurrence. Source delay does not change identity. One native Run may
contain multiple schedule executions, each with its own product execution
identity and exact detail/log destination.

Nominal scheduled time remains unknown unless the provider supplies a trusted
source value. Worker time, Run creation time and the most recent cron time are
not substitutes. GitHub may delay or drop schedules. Lite does not add arbitrary
lateness expiry, automatic catchup or automatic business retries.

Full and partial reruns of the same native Run are denied. Separate native Runs
are distinct source occurrences; Lite does not claim exactly-once processing
of one nominal cron slot across those Runs. Issue search followed by creation
is not an atomic unique claim. Workflow concurrency is not durable consumption
evidence. The admission boundary relies on one approved control/business path
per schedule occurrence and GitHub's normal job execution model.

## Native Timezone

Generated workflow entries preserve cron and IANA timezone:

```yaml
on:
  schedule:
    - cron: "0 5 * * *"
      timezone: "America/New_York"
```

Do not emit winter and summer UTC alternatives that both run year-round.
Within one generated Batch workflow, equal cron strings with different
timezones are a validation error: the documented `github.event.schedule`
context identifies the cron string, not which timezone entry fired. Equal
cron/timezone schedules with distinct schedule IDs remain separate business
paths. Invalid combinations must be visible before request approval.

This targets documented GitHub.com behavior, not all GitHub Enterprise Server
versions. Native support is not evidence that a particular repository delivered
its cron event. See [GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
and the [native timezone announcement](https://github.blog/changelog/2026-03-19-github-actions-late-march-2026-updates/).

## Evidence And Failure

Required request and allow-evidence writes must receive a successful response
before business is admitted. An uncertain response fails closed; do not blindly
repeat POSTs or issue another authorization. If business may already have run,
a result-write failure never starts it again or resets the original admission.

Result projection uses the exact schedule's job IDs and attempt. A workflow's
overall conclusion or another schedule's Gate cannot stand in for that result.
The earlier Gate allowance must not hide a later business-entry denial.
Generated job identities and Gate records must bind the request, digest, Batch
and schedule. Editable result comments cannot redirect readers to another job.
Once admitted, a completed command's observed result is still historical fact
if a later governed change disables or replaces the Batch. Result recording
does not grant a new execution permission.
Missing, unreadable or contradictory evidence remains unconfirmed rather than
becoming a fabricated business failure, success or pending human approval.

An `always()` recorder can itself be canceled or lose access. When even the
initial Issue cannot be written, do not claim a durable product record exists.
Available native Run/log evidence remains relevant and subject to platform
retention. Comments and labels are editable records, not an immutable ledger.
Readers must verify their correlation with actual platform evidence.
An uncorrelated source Run remains available for read-only inspection. It must
not be attributed to the first schedule, classified as a business failure from
the overall workflow conclusion, or given a fabricated request or owner.

Old delegated records may remain available as history, but cannot authorize
new execution. R4 does not add an old-execution compatibility or migration
framework. Test repositories are not reset or edited outside governed approval.

## Connected UI

The shared UI consumes product-client projections, not Issue bodies or raw
GitHub identifiers as policy. Required semantics are:

| Surface                       | Required behavior                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Approvals and approval counts | No scheduled occurrence becomes human approval work; unresolved authority is not a manual approval fallback.                          |
| Workspace requests            | Retain scheduled occurrences in the inventory and distinguish their trigger from manual requests.                                     |
| Request detail                | Show schedule, originating governed revision, Gate and actual execution separately; link to the exact execution detail, not its list. |
| Runs and recent executions    | Include native schedules and retain distinct schedule/attempt correlations.                                                           |
| Run detail and logs           | Match the occurrence's jobs; preserve business-command-first logs and deleted-Batch history.                                          |
| Failures and My Work          | Distinguish business failure, Gate block and unavailable evidence; keep existing explanation and manager-review journeys.             |
| Audit                         | Link original change authority, observed occurrence, Gate and actual result without inventing per-run human approvals.                |
| Change blocker                | A scheduled record must not be left as an actionable manual approval that blocks future changes indefinitely.                         |

The initial scheduled failure owner is the owner in the executing approved
Batch revision, not the bot requester or the current Batch owner. A blank owner
in registration/change defaults to the authenticated change requester before
preview and approval. Form, diff, digest and saved revision must agree. Preserve
nonblank owners and historical follow-up assignments. Ownership does not grant
Workspace, approval or review permission. Free-text owner validation and an
account picker are separate improvements, not hidden fallback reassignment.

## Verification Boundary

Deterministic tests must cover valid, disabled, deleted, changed and forged
authority; full and partial rerun with old outputs; cross-Run replay; delayed
identity; uncertain writes; mixed multi-schedule results; manual-policy
regressions; native timezone validation; owner/default and shared projections.
All changed Action bundles require direct Node 24 execution and source parity.
Affected UI is checked in English/Korean at desktop and 390px on port 5173
against issue #119. Full R5 UI structural migration is not implied.

Live proof is separate and requires an authorized test Workspace:

1. After the product change is merged, create a governed Batch change containing
   an enabled schedule and a harmless observable command. Review and approve
   its regenerated workflow; do not overwrite an already approved file directly.
2. Wait for the actual native schedule event. Verify the Run event, occurrence
   request, approved revision, Gate, same-Run command and recorded result.
3. Verify that no per-occurrence approval or second dispatched Run exists and
   that product request/run/failure/audit links agree.
4. Only with authorization, use two separate initial native Runs to test full
   rerun and failed-business-job-only rerun. For the latter, use a harmless
   intentionally failing command in the approved test definition. Verify that
   the command has no new execution and each current attempt's block does not
   inherit the earlier allowance.
5. Record actual timezone/event/attempt evidence separately from local fixtures.
   A delayed or absent native event is not proof that local YAML tests failed
   or that Gate ran.

Result synchronization (engine lookup and history reconciliation) and
reason-required cancellation (a real engine cancel request) are independent
future actions. Neither is implemented by pretending a local status is terminal
or by restarting business. Delay monitoring and backfill remain separate.
