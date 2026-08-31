# Control Plane UI Architecture

Status: Architecture baseline for issue #191

## 1. Purpose

Main and Lite use one React/Vite feature application. The UI presents one
BatchPlane operating model across providers while keeping native platform
details available when they help an operator diagnose or configure work.

This document defines the shared information architecture, runtime boundary,
page responsibilities, capability behavior, and edition-specific composition.
The detailed visual baseline for the current Lite implementation remains in
`lite-ui-ux-baseline.md`.

## 2. Navigation Model

The primary navigation is grouped by operator intent:

```text
Workspace switcher

Overview

Operations
  Batches
  Runs
  Failures

Requests
  My Work
  Approvals
  All Requests

Governance
  Audit Trail

Workspace
  Platform Connections
  Members And Roles
  Approval Policies
  Settings
```

Rules:

- `My Work` is personal and actionable; it is not the Workspace-wide request
  archive.
- `Approvals` contains only items on which the current user can make a decision.
- `All Requests` provides Workspace-wide change, execution, and follow-up
  history according to permission.
- `Runs` is the complete execution history; `Failures` is the follow-up subset.
- Provider source pages are secondary links from BatchPlane detail pages, not
  primary navigation.
- Lite may hide unsupported management pages, but it must preserve the grouping
  and route meanings.

## 3. Global Context

The application shell always knows:

- selected Workspace;
- optional provider/Platform Connection filter;
- signed-in Principal and effective roles;
- edition and runtime health;
- pending actionable work count;
- locale and display timezone.

Changing Workspace cancels or invalidates Workspace-scoped queries before the
new data renders. A detail route containing an object outside the selected
Workspace either changes context after confirmation or returns an authorized
not-found state; it never renders data under the wrong Workspace header.

Lite stores several repository connection sessions in `sessionStorage` and
uses the Workspace switcher to select one trust boundary. An optional `All
connected Workspaces` portfolio is read-only until the user enters a specific
Workspace for an action.

## 4. Page Responsibilities

### Overview

Shows compact operational totals and exceptions across the selected context:

- active and drifted Batches;
- running, failed, and Gate-blocked attempts;
- pending approvals and overdue follow-up;
- degraded Platform Connections;
- recent high-priority audit events.

Every metric deep-links to the corresponding filtered list. The page is an
operational summary, not a marketing dashboard.

### Batches

The list supports Workspace, provider, Platform Connection, lifecycle,
governance, environment, owner, and recent-run filters. Rows show enough
execution target and control status to distinguish similarly named batches.

The detail page contains compact sections in this order:

1. identity, lifecycle, provider, connection, and effective revision;
2. primary requests: run, change, suspend/restore, delete;
3. execution target and provider-specific configuration;
4. schedules and expected next occurrences;
5. recent runs and failures;
6. change, Gate, and audit evidence.

Gate is mandatory status attached to the execution target. It must not consume
a large standalone promotional card and must never look optional.

Deleted Batches retain the same detail route in read-only archive mode, with
their final revision and historical runs directly reachable.

### Requests And Approvals

One normalized request list supports:

- change requests;
- execution intents;
- failure submissions awaiting review.

Type-specific detail pages use the same header, state history, requester,
policy, decision, evidence, and source-link pattern. Change approval must show
material before/after fields and a native diff. Execution approval must show
the exact Batch revision, target, parameters or redacted bindings, reason,
expiry, and separation-of-duties result.

An item that is dispatched, applied, failed, rejected, expired, or otherwise no
longer actionable never shows active approve/reject controls. It links to its
result detail instead.

### Runs

Run list is provider-neutral and includes queued, running, succeeded, business
failed, Gate blocked, canceled, timed out, and unknown attempts. The default
view includes all states; a failure shortcut applies the relevant filter.

Run detail shows:

- Batch and immutable revision;
- trigger and authority source;
- normalized and native execution identity;
- Gate decision and reason;
- timestamps and state history;
- business log view first, full native log view on demand;
- source-platform link;
- failure follow-up state and action when applicable.

### Failures

Failure list separates business failures from Gate control exceptions. Business
failures support explanation and action submission. Closure requires an
independent Workspace Manager review. Gate blocks remain searchable control
exceptions and may open operational remediation work, but are not mislabeled as
business failures.

### Audit Trail

Audit uses the normalized event contract. Filters include Workspace,
connection, provider, Batch, actor, action, outcome, reason, request/attempt,
and time. Native evidence opens as a secondary source link. Export is available
only when runtime capability and authorization allow it.

### Platform Connections

Connection pages contain provider-specific setup, credentials reference,
capabilities, health, connector version, enforcement coverage, drift, and
upgrade actions. GitHub owner/repository and Jenkins endpoint are connection
fields; neither changes the product navigation vocabulary.

## 5. Runtime Boundary

Feature code imports product contracts only:

```text
feature page
  -> feature query/command hook
  -> BatchPlaneClient interface
  -> Main API client OR Lite application service
  -> provider/persistence adapter
```

Forbidden dependencies:

- feature component to GitHub REST client;
- feature component to Kotlin server DTO implementation detail;
- shared route to provider-name conditional;
- Lite composition root to a parser owned by a feature component;
- provider adapter to UI translation resources.

Provider-specific forms are rendered from a versioned configuration schema plus
bounded provider UI extensions. Extensions may contribute fields, validation,
help, and native preview; they may not replace approval, Gate, audit, or request
state components.

## 6. Query And Mutation Behavior

- A page entry and explicit refresh request fresh authoritative data.
- Query caching may deduplicate concurrent reads but must not mask a completed
  mutation or provider event behind a stale time-to-live.
- A successful mutation returns or immediately fetches its authoritative object
  and navigates to that BatchPlane detail route.
- Provider eventual consistency is shown as a named state such as `Awaiting
provider visibility`, not as missing data or a silent empty list.
- Optimistic UI is limited to reversible local presentation state. Approval,
  apply, dispatch, Gate, and failure-review outcomes are never guessed.
- List rows use stable dimensions and compact metadata so refreshes do not shift
  the layout.

## 7. Capability-Driven UX

The runtime combines edition and connection capabilities. Controls have four
possible states:

| State                        | Behavior                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Available                    | Normal command or navigation action                                                          |
| Unavailable by capability    | Disabled with a concise reason tooltip                                                       |
| Unavailable by authorization | Hidden for disclosure-sensitive actions or disabled with policy reason where context matters |
| Temporarily unavailable      | Disabled with health/retry context and no false permanent limitation                         |

Unsupported provider actions must not disappear if their absence would confuse
an operator reading a governed Batch. For example, a disabled `Cancel` action
shows that the provider does not support controlled cancellation.

## 8. Edition Composition

### Main

- authenticates through the configured IdP;
- receives product roles and Workspace membership from the server;
- supports multiple connections in one Workspace;
- uses server-side pagination, authorization, audit export, and provider health;
- never receives provider secret values.

### Lite

- authenticates with the current GitHub session token;
- maps one repository to one Workspace trust boundary;
- supports multiple connected Workspaces in volatile browser session state;
- uses GitHub-native PR, Issue, comment, and run evidence behind product view
  models;
- renders setup, branch-protection, token-scope, and managed-workflow health in
  the GitHub Platform Connection surface.

## 9. Internationalization And Accessibility

- English is the default locale and Korean is bundled.
- Locale selection begins with stored user choice, then browser locale, then
  English fallback.
- Contributors add locale resources through the supported-locale registry and
  message catalogs without editing feature conditions.
- Stable technical identifiers, provider resource names, reason codes, YAML
  fields, and log text are not translated.
- Icons have accessible names or adjacent text; unfamiliar icon-only controls
  have tooltips.
- Keyboard focus, error association, status semantics, contrast, and responsive
  text fit are release checks.

## 10. Screen Review Contract

Every screen implementation or material revision checks:

1. its place in the end-to-end operator journey;
2. the primary object and next action;
3. whether actionable work is separated from evidence/history;
4. whether provider detail is subordinate to product meaning;
5. whether mandatory Gate status appears compactly and unambiguously;
6. disabled-action reasons and empty/error/loading states;
7. authoritative refresh and post-mutation navigation;
8. English/Korean parity and extensible locale resources;
9. desktop and mobile layout without overlap or wasted structural space;
10. Main/Lite behavior through the same page component and client contract.

The standing UI/UX review issue remains open while screens are being developed;
individual PRs reference the applicable checklist evidence rather than treating
one initial review as permanent approval.
