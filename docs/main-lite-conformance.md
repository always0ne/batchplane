# Main and Lite Conformance

Status: Architecture baseline for issue #191

## 1. Purpose

BatchPlane Main and BatchPlane Lite are editions of one product. They use
different authorities and deployment models, but they must expose the same
control concepts and must not assign different meanings to the same user
action.

This document defines:

- the product invariants both editions must preserve;
- the differences each edition is allowed to expose;
- the evidence required to claim behavioral conformance;
- the compatibility rules while the current GitHub Lite implementation moves
  to the shared product model.

Edition conformance is semantic, not implementation-level. Main does not need
to store GitHub Issues, and Lite does not need a MySQL database, but an approved
change, an allowed execution, and a Gate denial must mean the same thing in both
editions.

## 2. Shared product vocabulary

The following terms have one meaning across both editions:

| Term                | Meaning                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- |
| Workspace           | Governance boundary containing memberships, policies, platform connections, and batches |
| Platform connection | Configured connection to a supported batch platform                                     |
| Batch               | Stable governed identity for one executable workload                                    |
| Batch revision      | Immutable approved configuration of a batch                                             |
| Change request      | Proposed registration, modification, suspension, restoration, or deletion               |
| Approval decision   | Auditable authorization or rejection of a request                                       |
| Execution intent    | Request or schedule occurrence that asks for a batch revision to run                    |
| Execution permit    | Short-lived Gate authorization for exactly one execution attempt                        |
| Execution attempt   | One platform-side attempt, including reruns and retries                                 |
| Schedule revision   | Approved schedule configuration attached to a batch revision                            |
| Failure case        | Governed follow-up record for a failed or Gate-blocked attempt                          |
| Audit event         | Append-only record of a security- or control-relevant fact                              |

Edition-specific labels such as GitHub Issue, pull request, workflow run, or
Jenkins build may appear as source references. They must not replace the shared
product terms in navigation, page titles, policy rules, or public contracts.

## 3. Mandatory invariants

### 3.1 Change control

Both editions must:

1. represent registration, modification, suspension, restoration, and deletion
   as change requests;
2. show the complete before/after diff before approval;
3. preserve requester, approver, decision, reason, time, and content digest;
4. apply only the content that was approved;
5. reject stale approval when the proposed content changes;
6. retain deleted batch revisions and historical execution links.

### 3.2 Execution control

Both editions must:

1. create an execution intent before a manual or API-triggered run;
2. apply the Workspace approval policy to that intent;
3. allow the target command only after Gate grants an execution permit;
4. bind the permit to Workspace, platform connection, batch revision,
   execution intent, and execution attempt;
5. reject reuse, stale evidence, target changes, and unauthorized reruns;
6. correlate the request, approval, Gate decision, platform run, logs, and
   result.

### 3.3 Schedule control

Both editions must:

1. make a schedule part of an approved batch revision;
2. use the approved schedule revision as the authority for unattended runs;
3. create a unique occurrence and execution-attempt identity for each due time;
4. prevent duplicate execution for the same occurrence key;
5. send every occurrence through Gate;
6. never fabricate a human approval or automatic-approval decision for each
   occurrence;
7. preserve the configured timezone and the platform-effective trigger value.

### 3.4 Audit and failure follow-up

Both editions must:

1. append audit evidence for every control decision and external side effect;
2. distinguish business failure from Gate denial;
3. provide execution detail, platform log access, and retained batch revision;
4. allow a responsible user to submit an explanation and remediation plan;
5. require Workspace-authorized review of the failure explanation;
6. preserve rejection, resubmission, and closure history.

## 4. Permitted edition differences

| Concern             | Main                                                                | Lite                                                                                                          | Conformance rule                                                                                             |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Authoritative store | MySQL                                                               | Git repository plus GitHub PR, Issue, comment, and run evidence                                               | Stored representation may differ; state transitions may not                                                  |
| Backend             | Kotlin/Spring Boot                                                  | Browser runtime plus GitHub APIs and Actions                                                                  | UI calls the same semantic client contract                                                                   |
| Identity source     | Configurable enterprise IdP adapter                                 | GitHub user, organization, team, and collaborator APIs                                                        | External identity is mapped to internal product roles                                                        |
| Workspace topology  | Multiple Workspaces; each may contain multiple platform connections | Multiple repository-backed Workspaces within a user session; each repository is an independent trust boundary | One browser session is not one product Workspace; Lite portfolio reads do not create shared policy authority |
| Platforms           | GitHub Actions first, then Jenkins and future providers             | GitHub Actions only                                                                                           | Unsupported capabilities must be explicit, not hidden                                                        |
| Approval evidence   | MySQL request and decision records                                  | Signed-in GitHub actor plus immutable request digest in GitHub evidence                                       | Self-approval and auto-approval modes have the same semantics                                                |
| Gate authority      | BatchPlane Gate API                                                 | GitHub evidence verifier in the Gate Action                                                                   | Both return the same decision and reason-code model                                                          |
| Audit export        | Query API and export jobs                                           | Reconstructed from GitHub evidence and optional export artifact                                               | Required fields and correlations are identical                                                               |
| Secrets             | Server-side secret references                                       | GitHub Actions secrets or variables referenced by name                                                        | Secret values never enter batch definition or UI storage                                                     |

## 5. Shared UI contract

The React application must use a runtime-injected `BatchPlaneClient`. Feature
components may not import GitHub or server transport clients directly.

The shared client is grouped by product capability:

```ts
export interface BatchPlaneClient {
  session: SessionClient;
  workspaces: WorkspaceClient;
  platformConnections: PlatformConnectionClient;
  batches: BatchClient;
  changes: ChangeRequestClient;
  approvals: ApprovalClient;
  executions: ExecutionClient;
  schedules: ScheduleClient;
  failures: FailureClient;
  audit: AuditClient;
  capabilities: CapabilityClient;
}
```

The Main bootstrap binds this contract to the Kotlin REST API. The Lite
bootstrap binds it to GitHub-backed application services. A feature page may
render provider-specific fields returned as typed capabilities, but it must not
branch on `edition === "lite"` for core business behavior.

Shared UI means one feature source and one behavioral test suite, not one
deployment artifact. Main and Lite use separate composition roots and produce
independently deployable builds. Neither bootstrap may depend on the other
edition's implementation. The source-repository decision is defined in
[`ADR-0001`](./adr/0001-modular-monorepo.md).

## 6. Capability negotiation

Platform differences are represented by capabilities, not scattered UI checks.

Examples:

- manual dispatch support;
- native schedule support;
- log streaming support;
- artifact upload support;
- cancel or retry support;
- environment and runner options;
- provider-specific configuration schema.

The UI must:

- show only valid controls for the selected platform connection;
- explain disabled controls with a concise tooltip;
- retain product-level language and navigation;
- render provider-specific configuration in a bounded section;
- show source-system links as secondary actions.

The UI must not infer capabilities from platform names.

## 7. Requirement conformance matrix

Every shared SRS requirement is classified as follows:

| Classification   | Meaning                                                                            |
| ---------------- | ---------------------------------------------------------------------------------- |
| `REQUIRED`       | The edition must implement the requirement before production use                   |
| `NOT_APPLICABLE` | The requirement cannot apply to that edition and has a documented reason           |
| `DEFERRED`       | The edition does not yet conform; release notes and UI expose the limitation       |
| `COMPATIBILITY`  | A legacy representation remains readable while new writes use the current contract |

No P0 requirement may be silently omitted. `DEFERRED` is allowed during
development but cannot be presented as full product conformance.

The release matrix must at least cover:

- every `CP-*` requirement from `control-plane-srs.md`;
- every provider capability used by the release;
- every Gate reason code;
- every request and attempt state transition;
- both Korean and English core workflows;
- accessibility and responsive layout checks for shared pages.

## 8. Conformance test suites

### 8.1 Domain contract tests

Run the same fixtures against Main and Lite application services:

- stale change digest is rejected;
- unauthorized approval is rejected;
- self-approval follows the configured policy mode;
- auto-approval writes explicit policy evidence;
- a scheduled occurrence uses schedule-revision authority;
- duplicate occurrence keys do not create duplicate target runs;
- a direct or repeated platform run is denied without a valid permit;
- deleted batch history remains queryable;
- failure explanation requires independent review.

### 8.2 Provider contract tests

Each provider must pass the provider TCK described in
`platform-provider-contract.md`. GitHub Actions must pass in both Main and Lite
hosting modes.

### 8.3 UI contract tests

Shared UI tests must run twice:

1. with the Main API test adapter;
2. with the Lite GitHub application-service test adapter.

Golden paths must use the same page components and assert equivalent labels,
states, validation, and navigation. Provider source links and setup details may
differ.

### 8.4 Gate protocol tests

Contract fixtures must prove that Main and Lite return equivalent decisions for
equivalent facts. The authority verifier may differ, but decision codes and
attempt binding must remain stable.

## 9. Legacy compatibility

The current Lite implementation represents scheduled occurrences as execution
request Issues with delegated-approval markers. This is a compatibility model,
not the target product semantics.

Migration rules are:

1. readers may recognize existing scheduled execution-request evidence;
2. those records are displayed as scheduled occurrences, not human-approved
   requests;
3. no new UI may describe the occurrence as delegated or automatic approval;
4. new writers move to the scheduled-occurrence evidence contract;
5. Gate accepts the legacy marker only during a versioned compatibility window;
6. removal requires migration telemetry and a published compatibility note.

## 10. Release claim

An edition may claim conformance only when:

- all applicable P0 requirements are `REQUIRED` and passing;
- no unresolved semantic mismatch exists between edition and product state;
- provider, Gate, audit, and UI contract suites pass;
- limitations are visible in setup and release documentation;
- evidence from the release build is retained.

"Implemented with GitHub" and "implemented with MySQL" are deployment facts.
They are not separate definitions of BatchPlane control.
