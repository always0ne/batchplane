# BatchPlane Control Plane Architecture

Status: Architecture baseline for issue #191

## Architecture Decision

BatchPlane Main is a Kotlin/Spring Boot modular monolith using hexagonal
boundaries. BatchPlane Lite is a TypeScript serverless runtime. Both editions
share product contracts and React UI source, but they do not share an authority
or persistence implementation.

The architecture uses one product, two runtime editions, and multiple Platform
Provider Bundles.

## System Context

```mermaid
flowchart TB
    USER[User / Operator / Auditor]
    SOURCE[Shared React/Vite Source]
    SOURCE --> MAIN_UI[Main UI Build]
    SOURCE --> LITE_UI[Lite UI Build]
    USER --> MAIN_UI
    USER --> LITE_UI

    subgraph MAIN[Main Runtime]
        MAIN_UI --> API[REST API]
        API --> APP[Application Use Cases]
        APP --> DOMAIN[Pure Kotlin Domain]
        APP --> MYSQL[(MySQL: state + audit + outbox)]
        APP --> PROVIDERS[Provider Registry]
        GATE_API[Gate API] --> APP
        EVENT_API[Provider Event API] --> APP
        IDP[Identity Adapters] --> API
    end

    subgraph LITE[Lite Runtime]
        LITE_UI --> LITE_APP[TypeScript Lite Use Cases]
        LITE_APP --> GITHUB_STORE[GitHub Governance Adapter]
        GITHUB_STORE --> REPO[Files / PRs / Issues]
        LITE_APP --> LITE_GHA[GitHub Actions Lite Adapter]
    end

    PROVIDERS --> GHA_SERVER[GitHub Actions Server Adapter]
    PROVIDERS --> JENKINS_SERVER[Jenkins Server Adapter]
    PROVIDERS --> FUTURE_SERVER[Future Provider Adapter]

    GHA_SERVER --> GHA[GitHub Actions]
    LITE_GHA --> GHA
    JENKINS_SERVER --> JENKINS[Jenkins]
    FUTURE_SERVER --> FUTURE[Future Platform]

    GHA --> GATE_ACTION[Gate Action]
    GATE_ACTION -->|server mode| GATE_API
    GATE_ACTION -->|lite mode| GITHUB_STORE
    GHA --> GHA_EVENTS[GitHub Webhooks]
    GHA_EVENTS --> EVENT_API

    JENKINS --> JENKINS_PLUGIN[Jenkins Plugin]
    JENKINS_PLUGIN --> GATE_API
    JENKINS --> JENKINS_EVENTS[Jenkins Events]
    JENKINS_EVENTS --> EVENT_API
```

## Runtime Ownership

### Main

Main owns product state, identity mapping, internal authorization, policy
evaluation, execution permits, normalized projections, audit events, provider
orchestration, reconciliation, notification outbox, and cross-provider views.

### Lite

Lite maps common product operations to GitHub repository primitives. Pull
Requests, Issues, comments, repository files, and workflow runs are storage and
transport mechanisms, not core domain types.

One private repository is one Lite governance trust boundary because its
repository token, policy files, branch protection, and Gate evidence are scoped
together. The Lite composition root may hold several volatile repository
sessions and provide Workspace switching or read-only portfolio aggregation.
Every mutation and authorization is still bound to one selected Workspace.

Treating multiple private repositories as one policy Workspace would require a
shared trusted authority and cross-repository credentials. That is a Main
deployment concern, not an implicit browser-side Lite capability.

### Batch Platform

Each platform owns its native resources, scheduler, execution engine, runners,
branching, downstream execution, native state, and logs. Platform-side Gate
connectors enforce BatchPlane decisions at the actual pre-business boundary.

## Repository And Main Module Structure

```text
apps/
  control-plane-server/
  web/                         shared React feature source
  web-main/                    Main composition and build entry
  web-lite/                    Lite composition and build entry

server/
  modules/
    workspace/
    catalog/
    governance/
    execution-control/
    scheduling/
    observation/
    failure-management/
    audit/
  adapters/
    inbound-rest/
    inbound-events/
    outbound-mysql/
    outbound-identity/
    outbound-secrets/
    outbound-notification/
  bootstrap/

packages/
  contracts/                   OpenAPI, JSON Schema, reason codes, fixtures
  ui-client/                   TypeScript BatchPlaneClient contract
  ui-kit/
  digest/

providers/
  sdk/
    spi/
    tck/
  github-actions/
    main-adapter/
    lite-adapter/
    gate-action/
    dispatcher-action/
  jenkins/
    main-adapter/
    gate-plugin/
```

The first implementation MAY keep current pnpm packages and add a Gradle build
alongside them. Root CI orchestrates pnpm and Gradle without making one language
toolchain responsible for the other.

## Dependency Rules

```text
adapter-in-*  ──→ application ──→ domain
adapter-out-* ──→ application ports
provider adapters ──→ provider SPI + contracts
bootstrap ──→ all concrete modules for composition only
web ──→ generated client contract, never Kotlin domain classes
lite runtime ──→ TypeScript product contract + GitHub adapter
```

- `domain` imports no Spring, persistence, GitHub, Jenkins, HTTP, or UI code.
- `application` imports domain and declares inbound use cases and outbound
  ports.
- inbound adapters translate REST/webhook messages to application commands.
- outbound adapters implement persistence, provider, identity, secret, audit,
  and notification ports.
- provider implementations do not import UI features.
- UI pages receive a `BatchPlaneClient` from application composition and do not
  read sessions or construct adapters directly.

Each `server/modules/*` Gradle module contains its own domain model,
application use cases, and declared ports. Cross-module calls use exported
application contracts or domain events; one module never reaches into another
module's persistence adapter.

## Application Modules

The modular monolith is divided by business capability, not technical layer
alone:

| Module             | Primary responsibility                                           |
| ------------------ | ---------------------------------------------------------------- |
| Workspace          | Workspace, membership, roles, policies, Platform Connections     |
| Catalog            | Batch discovery, onboarding, revision, drift, search projections |
| Governance         | Change Requests, Approval Cases, provider apply orchestration    |
| Execution Control  | Execution Intents, permits, dispatch, Gate start/complete        |
| Scheduling         | Schedule revisions, effective authority, occurrence correlation  |
| Observation        | Provider events, attempt state, reconciliation, logs metadata    |
| Failure Management | Failure cases, cause taxonomy, follow-up, manager review         |
| Audit              | Append-only event creation, search, export, evidence references  |
| Notification       | Outbox consumption and delivery-channel adapters                 |

Each capability may have `domain`, `application`, and adapter packages inside
its module while still enforcing the dependency direction above.

## Command And Query Separation

BatchPlane uses pragmatic command/query separation, not independent services.

- Commands load aggregates, enforce invariants, write current state, append
  audit events, and enqueue outbox records in one MySQL transaction.
- Queries read Workspace-scoped projections optimized for batch, run, failure,
  work-queue, and audit screens.
- Provider webhooks and reconciliation update projections through idempotent
  application commands.
- Full event sourcing is not required.

## MySQL Boundaries

One MySQL deployment may initially contain all Main tables:

```text
workspace / membership / role_binding / policy_revision
platform_connection / provider_capability / provider_health
batch / batch_revision / batch_external_ref / schedule_projection
change_request / approval_case / approval_decision / apply_attempt
execution_intent / execution_permit / execution_attempt / gate_decision
failure_case / failure_submission / failure_review
audit_event / audit_evidence_ref
outbox_event / inbox_deduplication
```

Responsibilities remain separate even when tables share a schema:

- Current-state tables may be updated under aggregate rules.
- Approval decisions, Gate decisions, audit events, and historical revisions are
  append-only through supported APIs.
- Outbox records are created in the state transaction and delivered later.
- Unique constraints enforce idempotency for command, provider event, native
  attempt, and Gate start/complete keys.

## Shared UI Composition

The shared information architecture and screen contract are defined in
[`control-plane-ui-architecture.md`](./control-plane-ui-architecture.md).

The same React source creates two configured builds:

```text
Main build: runtime.kind=server-api, API base URL configured
Lite build: runtime.kind=github-lite, GitHub session adapter configured
```

At application startup:

```typescript
type BatchPlaneClient = {
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
};
```

This client is injected through application context. Feature pages never select
Main versus Lite or GitHub versus Jenkins themselves.

## Provider Event Flow

Platform integration is bidirectional:

```text
BatchPlane command
  -> provider control adapter
  -> native platform operation
  -> native operation ID recorded

Native platform event
  -> authenticated webhook/plugin/event adapter
  -> inbox deduplication
  -> normalized application command
  -> attempt/projection/audit update
```

Polling is a reconciliation fallback, not the primary source when reliable
events exist. Late or repeated events are expected and processed idempotently.

## End-To-End Control Flows

The following sequences describe product semantics. Main persists the Core
steps in MySQL; Lite maps them to repository-native evidence.
In Lite sequence interpretation, `Core` means the product rules packaged into
the browser application service or Gate Action; it does not imply a hidden
BatchPlane server.

### Governed Change

```mermaid
sequenceDiagram
    actor Requester
    participant UI
    participant Core
    participant Provider
    actor Approver

    Requester->>UI: Propose register/change/delete
    UI->>Core: Create Change Request
    Core->>Provider: Plan native change
    Provider-->>Core: Normalized diff + native preview + plan digest
    Core-->>UI: Pending approval with complete diff
    Approver->>UI: Approve exact subject digest
    UI->>Core: Record immutable decision
    Core->>Core: Recheck policy and base revision
    Core->>Provider: Apply with idempotency key
    Provider-->>Core: Native operation reference
    Provider-->>Core: Completion event or reconciled result
    Core->>Core: Activate revision and append audit
```

An approval authorizes only the planned content. A provider operation can still
fail, conflict, or remain pending; the UI must not label the change effective
until the provider result is confirmed.

### Manual Or API Execution

```mermaid
sequenceDiagram
    actor Requester
    participant UI
    participant Core
    actor Approver
    participant Provider
    participant GateConnector as Platform Gate Connector
    participant Engine as Native Batch Engine

    Requester->>UI: Request execution
    UI->>Core: Create Execution Intent
    Approver->>UI: Approve exact intent digest
    UI->>Core: Record immutable decision
    Core->>Provider: Dispatch authorized intent
    Provider->>Engine: Create native attempt
    Engine->>GateConnector: Reach pre-business boundary
    GateConnector->>Core: START with authenticated native identity
    Core-->>GateConnector: ALLOW or DENY
    alt Allowed
        GateConnector->>Engine: Continue business command
        Engine-->>Core: Lifecycle events / reconciliation
        GateConnector->>Core: COMPLETE same attempt
    else Denied
        GateConnector-->>Engine: Stop before business command
    end
```

In Lite, the manual dispatcher is part of the GitHub provider implementation.
In Main, the provider worker dispatches after committed authorization. Neither
path allows the browser to call the native execution API directly.

### Scheduled Execution

```mermaid
sequenceDiagram
    actor Approver
    participant Core
    participant Provider
    participant Scheduler as Native Scheduler
    participant GateConnector as Platform Gate Connector
    participant Engine as Native Batch Engine

    Approver->>Core: Approve Batch and Schedule Revision
    Core->>Provider: Apply effective native schedule
    Provider-->>Core: Confirm schedule revision
    Scheduler->>Engine: Fire native occurrence
    Engine->>GateConnector: Reach pre-business boundary
    GateConnector->>Core: START with schedule and occurrence context
    Core->>Core: Resolve effective approved Schedule Revision
    Core-->>GateConnector: ALLOW or DENY
    alt Allowed
        GateConnector->>Engine: Continue business command
        Engine-->>Core: Lifecycle events / reconciliation
        GateConnector->>Core: COMPLETE same attempt
    else Denied
        GateConnector-->>Engine: Stop before business command
    end
```

The schedule approval is the authority. The occurrence creates an Execution
Attempt and Gate decision, not a fabricated human or automatic approval.

## Deployment Units

Initial deployment units are:

- `batchplane-server`: Kotlin application and Main UI static build.
- `batchplane-mysql`: externally managed or bundled MySQL deployment.
- `batchplane-worker`: optional separate process later; initially the server may
  execute outbox workers under the same codebase.
- `batchplane-lite`: static Lite UI build.
- `batchplane-gate-action`: published GitHub Action supporting Lite and Server
  modes.
- `batchplane-dispatcher-action`: Lite dispatcher.
- `batchplane-jenkins-plugin`: Jenkins enforcement and lifecycle connector.

Splitting Main into microservices requires measured scaling, availability, or
ownership pressure and a new architecture decision. It is not part of the
initial design.

## Architecture Enforcement

- Gradle module dependencies and ArchUnit tests enforce Kotlin boundaries.
- ESLint import rules enforce UI, Lite application, and adapter boundaries.
- OpenAPI and JSON Schema compatibility checks run in CI.
- The Adapter TCK runs against provider simulators and integration fixtures.
- A dependency report MUST fail CI when core domain code imports provider-
  specific packages.
