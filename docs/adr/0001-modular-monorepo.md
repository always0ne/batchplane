# ADR-0001: Keep Main And Lite In A Modular Monorepo

Status: Accepted

Date: 2026-08-31

Related issue: #191

## Context

BatchPlane has two runtime editions with different authority and persistence
models:

- Main is a Kotlin/Spring Boot control plane backed by MySQL.
- Lite is a TypeScript serverless edition backed by GitHub repository evidence
  and GitHub Actions.

The editions nevertheless share product vocabulary, UI workflows, policy and
Gate contracts, reason codes, audit semantics, and provider abstractions. These
boundaries are still being extracted from the existing Lite-first codebase and
will change together frequently while Main and the first shared GitHub Actions
provider are implemented.

Splitting the source into separate repositories now would require versioned
package publication and coordinated cross-repository changes before those
contracts are stable. Keeping all code in one undifferentiated build would
create the opposite problem by allowing Main and Lite implementation details to
couple directly.

## Decision

BatchPlane will use one authoritative source repository as a modular monorepo
for the current product stage.

This is a source-management decision, not a decision to create one executable,
one build, one deployment artifact, or one release version. Main, Lite, shared
libraries, policy code, and provider bundles must remain independently
buildable and independently releasable.

The allowed dependency direction is:

```text
Main ----\
          +---> shared UI, contracts, policy, and provider SPI
Lite ----/

Main --X--> Lite implementation
Lite --X--> Main implementation
```

The following rules are mandatory:

1. Main and Lite do not import each other's implementation packages.
2. Shared modules contain product contracts or genuinely shared behavior, not
   edition-specific transport, storage, identity, or provider payload types.
3. Main and Lite each have their own composition root, build entry point,
   runtime tests, deployment pipeline, and release artifact.
4. The React feature source and test suite are shared, while Main and Lite
   produce separate deployable UI builds.
5. Root CI runs cross-edition contract and conformance tests. Path-scoped jobs
   may avoid unrelated builds, but changes to shared modules test every affected
   consumer.
6. Each independently deployable unit can be built and tested without requiring
   another edition's application implementation.
7. Public contracts and artifacts are versioned so that a later repository
   split does not require redesigning the dependency boundaries.

The repository may use pnpm workspaces for TypeScript packages and Gradle
multi-project or composite builds for Kotlin modules. The root build only
orchestrates those build systems; neither toolchain owns the other.

## Releases And Distribution

Main, Lite, Gate actions, provider bundles, and shared contracts may use
independent artifact versions and release schedules while their source remains
in one repository.

This decision does not prohibit a small distribution repository later. For
example, compiled GitHub Actions may be mirrored to a release-only repository
to reduce consumer download size or isolate publication credentials. The
monorepo remains the authoritative source unless a later ADR changes it.

## Reconsideration Triggers

Repository separation will be reviewed after both of the following milestones:

- Main completes a production-capable vertical flow using the shared UI and
  policy/Gate contracts.
- GitHub Actions passes the same provider and Main/Lite conformance suites in
  both hosting modes.

At that review, one or more of the following conditions may justify a split:

- Main and Lite have independent maintainer teams and ownership boundaries.
- Their release cadences and support windows differ materially.
- Action publication and Main release credentials require repository-level
  security isolation.
- Most changes no longer touch shared contracts or require cross-edition
  verification.
- Repository size or CI duration measurably slows independent development.
- Proprietary or restricted modules require a different access boundary.
- A provider has an independent maintainer and release ecosystem.

These conditions trigger review; they do not cause an automatic split. A split
must identify stable versioned contracts, migration order, release ownership,
and cross-repository conformance CI in a new ADR.

## Consequences

Positive consequences:

- policy, Gate, UI, and contract changes can be reviewed and verified atomically;
- Lite remains runnable while Main is introduced incrementally;
- one pull request can prove equivalent behavior across editions;
- premature package publication and cross-repository merge coordination are
  avoided;
- enforced module boundaries preserve a practical future split path.

Costs and risks:

- root CI and release automation are more complex;
- path filtering, dependency checks, and code ownership must prevent unrelated
  changes from becoming one implicit release train;
- a monorepo can hide architectural coupling unless forbidden imports and
  conformance tests fail the build;
- GitHub Action distribution may eventually need a smaller release surface.

The controls above are part of the decision rather than optional follow-up
optimizations.
