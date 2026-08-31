# BatchPlane Product Scope And Editions

Status: Architecture baseline for issue #191

## Product Definition

BatchPlane is a unified batch control and audit platform. It gives operators one
Workspace-oriented experience for batch inventory, governed changes, execution,
schedules, Gate decisions, run history, failure follow-up, and audit evidence
across different batch platforms.

BatchPlane does not replace the execution lifecycle of GitHub Actions, Jenkins,
or future platforms. Each platform continues to own its native jobs, workflows,
schedulers, runners, branching, downstream execution, and completion behavior.
BatchPlane owns the common control plane and normalizes platform-specific
operations and evidence for users.

## Product Priorities

The following are product-level P0 invariants:

- Multi-platform batch inventory and operation through one control plane.
- Governed registration, change, and deletion.
- Governed manual and remote execution.
- Governed schedules whose approved revision is the execution authority.
- Mandatory pre-start Gate enforcement for governed execution.
- Independent records for requests, approvals, execution attempts, Gate
  decisions, completion, and rejected attempts.
- Internal authorization and separation-of-duties policy.
- Immutable audit evidence for user and service activity.
- Business-failure explanation, action, and manager review.
- Cross-Workspace and cross-platform run, failure, and audit views.

P0 defines the contract an adapter must satisfy before it is considered a fully
governed provider. It does not require every provider to ship in the same
release. Provider delivery order is GitHub Actions first, Jenkins second, and
additional platforms after the Provider contract is proven.

## Editions

BatchPlane has one product model and two runtime editions.

### Main

Main is the installable control-plane edition.

- Kotlin and Spring Boot application.
- MySQL authority for product state.
- Append-only audit and transactional outbox records in MySQL.
- React/Vite Main UI build.
- Internal RBAC fed by pluggable identity providers.
- Multiple Workspaces and Platform Connections.
- GitHub Actions as the first provider.
- Jenkins as the next provider.
- Provider SDK for future platforms.
- Server Gate API for platform-side Gate connectors.

### Lite

Lite is the GitHub-native, serverless edition.

- React/Vite Lite UI build hosted by GitHub Pages or another static host.
- No BatchPlane application server or database.
- GitHub repository files as configuration and definition evidence.
- Pull Requests as governed change records.
- Issues and comments as execution, approval, dispatch, and follow-up evidence.
- GitHub Actions as the only execution provider.
- GitHub identity and repository membership mapped to Lite roles.
- Gate Action verifies repository-backed evidence locally.
- Multiple repository-backed Workspaces connected in one browser session, with
  Workspace switching and portfolio views.

Lite is not the definition of the core domain. It is one runtime implementation
of the common product semantics.

Lite v1 deliberately does not pretend that several private repositories share
one central Workspace authority. Without a server, a target repository's Gate
cannot safely read an unrelated private repository using its repository-scoped
token. Multi-repository Lite therefore connects multiple repository-backed
Workspaces and provides switching and aggregate portfolio views. Main supports
the broader model of multiple Platform Connections inside one Workspace.

## Shared And Edition-Specific Responsibilities

| Concern             | Shared product meaning                            | Main authority             | Lite authority                                                              |
| ------------------- | ------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------- |
| Workspace           | Governance and access boundary                    | MySQL                      | One repository-backed trust boundary; multiple may be connected per session |
| Platform Connection | Configured batch-platform endpoint                | MySQL and secret reference | GitHub repository session                                                   |
| Batch               | Governed batch identity and current revision      | MySQL                      | Batch definition file                                                       |
| Change Request      | Proposed register/change/delete operation         | MySQL workflow             | Pull Request                                                                |
| Approval            | Immutable decision under a policy snapshot        | MySQL decision record      | PR review/comment evidence                                                  |
| Execution Intent    | Requested reason, target, parameters, and trigger | MySQL                      | Issue body and digest                                                       |
| Schedule Authority  | Approved schedule revision                        | MySQL revision             | Merged batch definition revision                                            |
| Execution Attempt   | One native start attempt                          | MySQL                      | GitHub Actions run and evidence                                             |
| Gate Decision       | Allow or deny before business work                | Server Gate API record     | Gate Action evidence                                                        |
| Failure Follow-up   | Explanation, action, and manager review           | MySQL                      | Structured immutable comments                                               |
| Audit               | Searchable evidence timeline                      | Append-only table          | GitHub-backed evidence projection                                           |

## Provider Roadmap

### Reference Provider: GitHub Actions

GitHub Actions is the reference provider because it exercises both editions.

- Lite uses repository-native governance and the GitHub Actions runtime.
- Main uses a GitHub App/server credential, the Main approval authority, the
  GitHub Actions Server Adapter, webhooks, and Gate Action server mode.
- The same provider semantics must pass the common Adapter TCK in both modes.

### Second Provider: Jenkins

Jenkins validates that the product contract is not GitHub-specific.

- Jenkins Server Adapter manages discovery, change, execution, schedules,
  observation, and logs.
- Jenkins Plugin enforces the actual pre-start boundary and reports completion.
- Jenkins-native identities and objects are mapped to BatchPlane internal
  principals and external resource references.

### Future Providers

SCDF, Kubernetes-oriented platforms, and other schedulers are examples, not
hard-coded roadmap commitments. A new provider must be addable without adding
provider-specific types to the core domain or provider-specific routes to the
shared UI.

## Product Boundaries

BatchPlane owns:

- Product identity, Workspace membership, internal roles, and policy mapping.
- Governed request and approval lifecycle.
- Execution authorization and Gate decision lifecycle.
- Normalized inventory, schedule, execution, failure, and audit views.
- Correlation between product requests and native platform resources.
- Provider capability, compatibility, health, and enforcement coverage.

Batch platforms own:

- Native workflow or Job execution.
- Native scheduling and runner allocation.
- Branching, joining, retry, and downstream execution semantics.
- Native logs and platform-specific diagnostics.
- Native resource availability.

Identity providers own authentication facts and external group membership.
BatchPlane maps those facts to internal Workspace roles and evaluates product
authorization itself.

## Non-Goals

- Replacing every platform with a new batch execution engine.
- Hiding all provider-specific diagnostics from advanced operators.
- Loading untrusted third-party JVM code dynamically into the Main server in
  the first provider-SDK release.
- Treating platform polling after business work started as a substitute for
  mandatory pre-start enforcement.
- Treating a digest, Issue label, or external role as sufficient authorization
  without policy and evidence verification.

## Release Principle

A provider may initially declare only a subset of capabilities, but the product
must label unprotected or unsupported operations explicitly. A provider cannot
be advertised as fully governed until registration/change/delete, execution,
schedule, Gate, observation, audit correlation, and failure follow-up satisfy
the P0 contract or are explicitly outside the provider's documented scope.
