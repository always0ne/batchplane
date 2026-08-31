# Control Plane Migration Plan

Status: Architecture baseline for issue #191

## 1. Goal

Move the existing GitHub Lite implementation into a unified BatchPlane product
without stopping Lite development or rebuilding the product twice.

The migration introduces:

- a platform-neutral product contract;
- one shared React/Vite feature application;
- a GitHub-backed Lite runtime;
- a Kotlin/Spring Boot Main runtime with MySQL;
- a provider boundary that supports GitHub Actions first and Jenkins next;
- one Gate protocol with edition-specific authority verifiers.

This is an incremental extraction. It is not a big-bang rewrite.

## 2. Current-state assessment

The current repository is a working Lite-first monorepo. Its strongest assets
are the GitHub API client, canonical digest handling, GitHub Actions Gate and
dispatcher actions, repository installation flow, and the React workflow for
change, approval, execution, run history, and failure follow-up.

The main structural debt is that GitHub storage concepts currently leak into
product types and UI feature code:

- `packages/domain` contains GitHub workflow, Issue, pull-request, and role
  shapes alongside product rules;
- `apps/web/src/runtime/github-lite-runtime.ts` imports feature parsers, causing
  composition code to depend inward on UI features;
- GitHub API response parsing exists in feature directories;
- Gate declares a server mode, but only Lite verification is implemented;
- schedules are represented as automatically approved execution requests rather
  than approved schedule occurrences;
- Workspace currently behaves mainly as a connected GitHub repository.

These are migration inputs, not reasons to discard the existing implementation.

## 3. Target repository shape

```text
apps/
  web/                         Shared React/Vite feature application
  web-main/                    Main bootstrap and API client binding
  web-lite/                    Lite bootstrap and GitHub binding
  control-plane-server/        Spring Boot composition and executable

server/
  modules/                     Business-capability Gradle modules
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
  ui-client/                   BatchPlaneClient TypeScript contracts
  ui-kit/                      Shared product presentation primitives
  digest/                      Canonical payload utilities

providers/
  github-actions/
    main-adapter/              Kotlin platform adapter
    lite-adapter/              TypeScript GitHub-backed application services
    gate-action/               Platform-side Gate connector
    dispatcher-action/
    schedule-action/
  jenkins/
    main-adapter/
    gate-plugin/

examples/
  github-lite-demo/
```

Physical movement may be delayed when it creates needless churn. Dependency
direction must be enforced before directory perfection.

## 4. Current-to-target mapping

| Current path                                  | Target responsibility                   | Migration rule                                                          |
| --------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| `apps/web`                                    | Shared feature application              | Keep pages; remove direct GitHub/runtime imports from features          |
| `apps/web/src/runtime/github-lite-runtime.ts` | Lite composition root                   | Move mapping and orchestration into Lite adapter application services   |
| `packages/domain`                             | Product model plus GitHub-specific DTOs | Extract neutral contracts first; keep compatibility exports temporarily |
| `packages/digest`                             | Canonical evidence digest               | Preserve as shared contract implementation and publish fixtures         |
| `packages/github-lite`                        | GitHub transport and Lite adapter       | Split raw API transport from product application service                |
| `actions/gate`                                | GitHub Actions Gate connector           | Share protocol schemas; implement Lite verifier and Main API mode       |
| `actions/dispatcher`                          | GitHub Actions dispatch bridge          | Keep provider-specific; consume stable provider event contracts         |
| schedule request action                       | GitHub schedule occurrence bridge       | Change writes from approval evidence to occurrence evidence             |
| GitHub parsers in feature code                | Adapter mapping                         | Move below `BatchPlaneClient`; UI receives product view models          |
| Lite YAML markers                             | Lite persistence schema                 | Version, retain readers, and migrate new writes incrementally           |

## 5. Migration principles

1. Preserve a runnable Lite release after every phase.
2. Change dependency direction before changing deployment topology.
3. Introduce one contract and migrate one vertical flow at a time.
4. Keep compatibility readers longer than compatibility writers.
5. Do not create a generic provider API by merely renaming GitHub nouns.
6. Add a provider capability only when GitHub or Jenkins implementation proves
   the abstraction.
7. Keep MySQL persistence behind ports; domain and application modules do not
   depend on JPA entities.
8. Keep UI page components shared; only application bootstraps and bounded
   provider configuration differ.
9. Do not merge repository-wide moves with behavior changes unless the move is
   required for the behavior.
10. Every phase closes with local CI, contract tests, and a manually executable
    golden path.

## 6. Phase plan

### Phase 0: Lock the architecture baseline

Deliverables:

- product scope and edition boundaries;
- shared SRS and domain state machines;
- provider and Gate contracts;
- identity, authorization, audit, and evidence contracts;
- Main/Lite conformance matrix;
- accepted migration plan.

Exit criteria:

- existing Lite specs no longer contradict the shared schedule or Gate model;
- README identifies BatchPlane as a multi-platform control plane;
- architectural decisions needed for implementation are explicit.

### Phase 1: Introduce the UI application port

Work:

- add `packages/ui-client` with the grouped `BatchPlaneClient` interfaces;
- inject the client through the application bootstrap;
- move GitHub response parsing out of feature components;
- wrap the existing Lite behavior behind product-shaped application services;
- keep routes and visual behavior stable except where terminology is corrected.

Recommended vertical slices:

1. session, Workspace, and platform connections;
2. batch list and detail;
3. change requests and approvals;
4. execution requests, run detail, and logs;
5. failure follow-up and audit.

Exit criteria:

- no feature component imports `packages/github-lite`;
- no runtime/composition module imports a feature parser;
- UI tests run against an in-memory `BatchPlaneClient` fixture;
- Lite smoke tests still pass.

### Phase 2: Version contracts and repair schedule semantics

Work:

- publish versioned JSON Schemas for product IDs, digests, Gate decisions,
  provider events, and audit envelopes;
- add contract fixtures shared by TypeScript and Kotlin;
- introduce scheduled-occurrence evidence;
- retain read compatibility for legacy delegated-approval records;
- change scheduled workflows from dispatcher re-entry to same-run Gate and
  completion reporting;
- adopt provider-declared native timezone handling without silent fixed-UTC
  emulation;
- move production managed-action references from a development branch to an
  approved immutable release ref;
- make duplicate occurrence protection explicit;
- align manual request, schedule occurrence, and rerun semantics.

Exit criteria:

- new scheduled runs do not create fake approval decisions;
- old evidence remains visible and verifiable;
- Gate contract tests cover manual, schedule, API, rerun, stale, and duplicate
  cases;
- Gate-allowed GitHub attempts report terminal completion against the same
  attempt;
- current GitHub Lite workflows remain installable and updatable.

### Phase 3: Create the Kotlin Main modular monolith

Work:

- bootstrap Kotlin and Spring Boot modules using Java 21;
- implement product aggregates and application use cases without platform code;
- add MySQL schema migrations;
- implement transactional outbox and append-only audit writes;
- expose OpenAPI endpoints matching `BatchPlaneClient`;
- implement enterprise identity adapter ports and local-development identity;
- add server-side authorization and Workspace policy evaluation.

Minimum MySQL domains:

- Workspaces, memberships, roles, and policy revisions;
- platform connections and encrypted credential references;
- batches, immutable revisions, and schedules;
- change requests, decisions, and application state;
- execution intents, permits, attempts, and platform runs;
- failure cases, explanations, reviews, and closure;
- audit events, provider events, idempotency keys, and outbox records.

Exit criteria:

- Main can run locally with MySQL and the shared UI;
- registration-to-approval works against an in-memory test provider;
- audit and state changes share a transaction;
- unauthorized writes fail in application and HTTP layers.

### Phase 4: Add GitHub Actions to Main

Work:

- implement the Kotlin GitHub Actions provider adapter;
- install or update required workflows in connected repositories;
- map GitHub workflow runs and logs into execution attempts;
- implement webhook ingestion plus reconciliation polling;
- implement Gate server mode with GitHub OIDC authentication;
- retain source links to GitHub without making them the primary product route.

Exit criteria:

- a Main Workspace connects one or more GitHub repositories;
- batch registration/change/delete, approval, manual execution, schedule,
  Gate, run history, logs, failure follow-up, and audit complete end to end;
- a direct or unauthorized workflow rerun is denied before the batch command;
- duplicate webhooks and poll results do not duplicate attempts or audit facts.

### Phase 5: Harden Lite/Main conformance

Work:

- run the same behavioral fixtures against both editions;
- remove edition checks from shared feature components;
- publish an edition capability matrix in setup;
- complete multi-Workspace Lite navigation;
- verify that deleted history, failure review, and audit export are equivalent;
- define support and deprecation windows for legacy Lite evidence.

Exit criteria:

- all applicable P0 requirements pass in both editions;
- remaining Lite limitations are explicit in UI and docs;
- one shared UI build is proven with both bootstraps.

### Phase 6: Add Jenkins as the second provider

Work:

- validate the provider contract against a non-Git platform;
- implement Jenkins job discovery, change application, scheduling, execution,
  cancellation, logs, and result reconciliation according to capability;
- implement a Jenkins Gate plugin or pre-build connector;
- map Jenkins users and service identities without assigning product roles in
  Jenkins;
- add provider TCK fixtures and operational runbooks.

Exit criteria:

- GitHub Actions and Jenkins run through the same application use cases;
- no Jenkins behavior is implemented by adding conditionals to core modules;
- platform-specific limitations are capability-driven in the UI;
- provider loss or delay cannot corrupt authoritative Main state.

Future providers begin only after this phase proves that the abstraction is not
GitHub-shaped.

## 7. Data migration and compatibility

Lite remains GitHub-authoritative; there is no requirement to import every Lite
Workspace automatically into Main. An explicit adoption flow should later:

1. connect the existing GitHub repository as a Main platform connection;
2. scan and validate BatchPlane Lite governance files;
3. import approved batch revisions and historical source references;
4. preserve Git commit SHA, pull-request, Issue, and run links;
5. report unsupported or ambiguous evidence before writing Main state;
6. create an import audit event and reconciliation report;
7. leave the repository usable until cutover is confirmed.

The same repository must not be actively governed by Lite and Main at the same
time unless a documented read-only coexistence mode is enabled. Otherwise two
authorities could approve competing revisions.

## 8. API and schema compatibility

- Public contracts use explicit semantic versions.
- Additive fields are optional until all supported clients understand them.
- Reason codes and state values are never silently repurposed.
- Readers tolerate unknown additive fields and reject unknown security-critical
  decisions.
- Gate connector and server versions advertise supported protocol ranges.
- UI build and server expose compatibility metadata during startup.
- Provider event schemas include provider name, provider version, event version,
  external key, and observed time.

## 9. Delivery work packages

Architecture issue #191 owns this baseline only. Implementation should be split
into planned work packages after review:

| Package                | Scope                                                  | Dependency                  |
| ---------------------- | ------------------------------------------------------ | --------------------------- |
| UI port foundation     | `BatchPlaneClient`, composition roots, fixtures        | Phase 0                     |
| Lite domain extraction | Move GitHub parsing behind application services        | UI port foundation          |
| Schedule evidence v2   | Occurrence contract, compatibility reader, Gate update | Contract schemas            |
| Main skeleton          | Kotlin modules, MySQL, migration tool, local auth      | Phase 0                     |
| Main shared API        | OpenAPI, authorization, audit, outbox                  | Main skeleton               |
| GitHub Main provider   | API, webhooks, polling, workflow installation          | Main shared API             |
| Gate server mode       | OIDC, permit issue/consume, completion                 | Main shared API             |
| Main UI bootstrap      | Shared React application against server API            | UI port foundation          |
| Conformance suite      | Shared fixtures across Main and Lite                   | Contracts implemented       |
| Jenkins provider       | Adapter plus Gate integration                          | GitHub Main provider stable |

Each work package may combine adjacent small tasks, but it must preserve reviewable
behavioral boundaries and run the full repository CI before pull-request creation.

## 10. Risks and controls

| Risk                                             | Control                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Core abstraction remains GitHub-shaped           | Validate every provider concept against Jenkins before freezing it              |
| Lite regressions slow Main work                  | Preserve vertical smoke tests and compatibility readers per phase               |
| Shared UI becomes full of edition branches       | Enforce `BatchPlaneClient` injection and capability-based rendering             |
| Duplicate external events corrupt state          | Require provider idempotency keys, unique indexes, inbox/outbox patterns        |
| Gate outage runs ungoverned work                 | Fail closed before the batch command; expose denial and recovery state          |
| MySQL model becomes coupled to provider payloads | Store normalized identifiers and separate versioned raw evidence                |
| Plugin extensibility creates supply-chain risk   | Ship providers with releases first; do not load arbitrary JVM JARs              |
| Lite and Main both govern one repository         | Require explicit authority ownership and adoption cutover                       |
| Audit growth hurts operational queries           | Separate current-state projections from append-only evidence and archive safely |
| Architecture docs drift from code                | Add dependency checks, contract tests, and requirement links to PR templates    |

## 11. Definition of migration complete

The migration is complete when:

- Main and Lite implement the same applicable P0 product semantics;
- GitHub Actions is supported by both editions;
- Jenkins proves the platform provider boundary;
- Main runs as a Kotlin/Spring Boot modular monolith backed by MySQL;
- the React feature application is shared and runtime-injected;
- platform connectors cannot bypass Core approval, Gate, audit, or failure
  follow-up rules;
- schedules run from approved schedule revisions without occurrence-level fake
  approvals;
- all provider events and execution attempts are idempotently correlated;
- deletion never removes audit or historical execution access;
- the conformance and provider TCK suites pass in release CI.
