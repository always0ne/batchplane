# Control Plane Architecture Review

Status: Architecture baseline for issue #191

## 1. Review Method

The architecture baseline was read end to end from the perspectives of a
senior developer, product planner, operator, IT auditor, security engineer, QA
engineer, and senior architect. The review checks product completeness,
implementation boundaries, operability, evidence integrity, and Main/Lite
consistency rather than treating document count as completion.

## 2. Role Findings And Resolutions

### Senior Developer

Checks:

- Can application use cases be implemented without GitHub types in Core?
- Are state machines and idempotency boundaries explicit?
- Can one React feature page run against both editions?
- Are external side effects recoverable?

Resolved design:

- Product IDs, aggregates, state machines, provider specifications, and native
  references are separated in `domain-model.md`.
- Commands commit state, audit, and outbox together; provider calls happen
  after commit.
- `BatchPlaneClient` is the only feature-runtime boundary.
- Start and completion use the same Execution Attempt identity.
- Contract fixtures are language-neutral so TypeScript and Kotlin can prove
  equivalent digests and decisions.

### Product Planner And UX

Checks:

- Is multi-platform operation the primary product rather than a future aside?
- Are Main and Lite recognizable as editions of one product?
- Can users understand where requests, approvals, runs, failures, and audit
  belong?
- Does provider detail overwhelm product tasks?

Resolved design:

- Multi-platform inventory and operation is the first P0 invariant.
- GitHub Actions ships first, Jenkins proves the second provider, and future
  providers do not alter routes or Core state.
- Shared navigation separates Operations, Requests, Governance, and Workspace.
- Native source links and provider fields remain available but secondary.
- Mandatory Gate status is compact and never rendered as an optional feature.
- Disabled actions expose a reason, and successful mutations navigate to the
  authoritative BatchPlane detail.

### Batch Operator

Checks:

- Are native execution, logs, schedules, retries, and failures observable?
- Can delayed or repeated provider events corrupt state?
- Is a Gate block distinguishable from a business failure?
- Can deleted Batch history still be investigated?

Resolved design:

- Provider event delivery is at least once with inbox deduplication and
  reconciliation.
- Run states include queued, running, success, business failure, Gate block,
  canceled, timed out, and unknown.
- Logs are fetched on demand with source links; they are not falsely claimed as
  permanent audit evidence.
- Native schedule limitations, expected/observed timing, overlap, misfire, and
  timezone capability are explicit.
- Deleted revisions, runs, failures, and audit remain queryable.

### IT Auditor

Checks:

- Are requester, approver, automation, and platform actors distinguishable?
- Can a changed subject reuse an old approval?
- Is schedule authority traceable without fake per-run approvals?
- Does failure explanation receive independent review?

Resolved design:

- Approval binds subject digest and immutable policy revision.
- Self-approval is blocked by default; relaxed modes produce explicit evidence.
- Schedule Revision approval is the authority for occurrences.
- Gate records allowed and denied attempts before business work.
- Failure submissions and Workspace Manager decisions are separate immutable
  records.
- State, decision rows, evidence references, and append-only audit are separated.

### Security Engineer

Checks:

- Does the server trust user-supplied provider identity?
- Are browser and platform credentials correctly bounded?
- Can moving action code or cross-repository access weaken the control?
- Is there an implicit fail-open path?

Resolved design:

- Main validates GitHub OIDC issuer, audience, repository, workflow, SHA, run,
  event, and attempt claims; body fields cannot override them.
- Lite uses repository-scoped evidence and volatile browser credentials.
- One private repository remains one Lite trust boundary; multi-repository
  operation uses multiple Workspaces rather than hidden cross-repository trust.
- Production connectors use approved immutable release references.
- Gate fails closed; break glass requires a separate explicit design and
  approval flow.
- Arbitrary third-party JVM JAR loading is excluded from the initial SDK.

### QA And Release Engineer

Checks:

- Can provider and edition behavior be tested without manual interpretation?
- Are reason codes and schemas stable?
- Can existing Lite evidence survive migration?

Resolved design:

- Provider TCK covers each declared capability.
- Main/Lite fixtures cover equivalent domain, Gate, audit, and UI behavior.
- OpenAPI and JSON Schema compatibility run in CI.
- Legacy BatchTrail and delegated-schedule evidence remains readable through a
  versioned compatibility window while new writers use current semantics.
- Full pnpm CI remains required before architecture-document PR creation; Gradle
  checks are added when the Main skeleton lands.

### Senior Architect

Checks:

- Is the architecture extensible without premature microservices?
- Are authority, provider lifecycle, and product policy owned in the right
  places?
- Does the migration preserve working Lite behavior?

Resolved design:

- Main begins as a Kotlin/Spring Boot modular monolith with capability modules
  and hexagonal ports.
- MySQL stores authoritative state, immutable evidence, and outbox records under
  explicit responsibilities.
- Platforms own native lifecycle; BatchPlane owns request, policy, Gate,
  normalized evidence, and correlation.
- Provider adapters control and observe; platform-side connectors enforce the
  pre-business boundary.
- Migration extracts dependency direction and vertical slices before moving
  directories or adding Jenkins.

## 3. Corrected Cross-Document Defects

The review corrected these material defects in the prior Lite documentation:

1. Scheduled occurrences were described as automatically or delegated-approved
   Execution Requests. They now use approved Schedule Revision authority.
2. Scheduled execution depended on a second dispatcher flow. It now reaches
   Gate and the business job in the same native schedule run.
3. Generated workflow design lacked terminal completion reporting. It now
   requires an idempotent completion job or provider lifecycle callback.
4. GitHub schedules were specified as fixed UTC conversion. Current native IANA
   timezone capability is used, and unsupported environments must be explicit.
5. Lite multi-repository operation risked implying one shared trust authority.
   Repository-backed Workspaces are now separate trust boundaries with session
   switching and portfolio reads.
6. Production actions could follow the moving `main` branch. Production
   installation now requires an approved immutable version reference.
7. UI runtime examples used inconsistent client names. They now use one
   `BatchPlaneClient` capability contract.

## 4. Decisions Intentionally Deferred

These choices are required before production deployment but do not change the
architecture baseline:

- primary Main IdP and assurance requirements;
- secret-manager implementation;
- MySQL deployment topology, backup targets, RPO, and RTO;
- Gate availability target, timeout, and approved break-glass policy;
- audit retention by jurisdiction and evidence category;
- notification channels;
- supported GitHub Enterprise Server versions;
- packaging priority among Docker Compose, Kubernetes manifests, and other
  installation methods.

Each deferred decision has an explicit port, policy, or deployment boundary.
None permits bypassing the P0 control contract.

## 5. Review Conclusion

The baseline is sufficient to split implementation work without inventing a
second product model. The next implementation package should establish the
shared `BatchPlaneClient` boundary and move GitHub parsing behind the Lite
adapter before a Kotlin Main UI client or Jenkins adapter is added.

No provider is considered fully governed merely because it can dispatch a Job.
P0 completion requires governed change, schedule, Gate, observation, audit
correlation, deletion history, and failure follow-up for its declared scope.
