# Shared UI Architecture

Status: Current UI boundary and approved target, reconciled 2026-10-05.
This document does not declare Main or multiple Workspaces implemented.

## Actual Dependency Direction

```text
app/router + runtime composition
  -> React Pages and owned components/Hooks
  -> client Context
  -> packages/ui-client: BatchPlaneClient
  -> injected implementation
       Lite: packages/github-lite -> GitHub
       Main: future HTTP adapter -> Kotlin application -> platform adapters
```

The current contract is [the source interface](../packages/ui-client/src/index.ts).
Do not introduce a parallel grouped client, generic form renderer or provider
SDK just to match an illustration. Future methods follow approved complete flows.

## Ownership And Readability

Follow [mandatory engineering principles](./frontend-engineering-principles.md)
and the libraries' documented composition patterns.

- `app`: routing, providers and composition, with React Router route objects,
  layout and Outlet rather than a custom route switch.
- `pages`: business areas; list/detail/new folders when multiple Pages exist.
  Pages reveal screen composition; meaningful child components have separate
  owner-local files. Page-only Hooks stay with their owner.
- `components`: genuinely product-neutral controls and visual tokens.
- `client`: the narrow React bridge to the product client.
- `runtime`: implementation selection and provider-specific connection editor.
- `assets`: branding; `shared`: non-visual neutral support such as i18n.

No `features` or global `ui` layer, no overview/operations/control directory
grouping, no helper-per-file fragmentation. Simple ternaries and maps are useful;
nested multi-state markup and oversized Hooks hide responsibility.

## Current Sitemap

These routes are verified against [router.tsx](../apps/web/src/app/router.tsx).
They are not proposed Main endpoints.

| Route                                      | Page ownership / purpose                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `/dashboard`                               | `pages/dashboard`: operating summary                                          |
| `/my-work`                                 | `pages/my-work`: actionable work assigned to the user                         |
| `/batches`                                 | `pages/batches/list`: Batch inventory                                         |
| `/batches/:batchId`                        | `pages/batches/detail`: configuration, schedules, history and request actions |
| `/batches/new`                             | `pages/requests/changes/new`: existing change-writing route                   |
| `/approvals/registration/:requestLocator`  | `pages/requests/changes/detail`: existing change detail                       |
| `/batches/:batchId/execution-requests/new` | `pages/requests/execution/new`: manual execution request                      |
| `/execution-requests/:requestLocator`      | `pages/requests/execution/detail`: execution request detail                   |
| `/requests`                                | `pages/requests/list`: Workspace request inventory                            |
| `/approvals`                               | `pages/approvals`: approval inbox                                             |
| `/executions`                              | `pages/executions/list`: execution inventory                                  |
| `/executions/:executionId`                 | `pages/executions/detail`: exact execution and logs                           |
| `/executions/failures`                     | `pages/executions/failures`: failures and follow-up entry                     |
| `/audit`                                   | `pages/audit`: evidence timeline                                              |
| `/workspace`                               | `pages/workspace`: shared settings and injected connection form               |

The existing schedule-writing URL redirects into Batch change writing; schedules
are not directly mutated from Batch detail. Request routes remain until #142.
Its future `/requests/new` and `/requests/:requestId` are recorded in the
[unified-request specification](./unified-request-feature-spec.md), not added by
this document PR. Cross-Batch schedule inventory #206 is still pending.

## Workspace And Provider Scope

Main will support multiple connections in one Workspace. A provider-specific
typed connection editor is composed by runtime; Workspace policy stays in the
shared Page. Do not infer provider identity from a Workspace URL.

#142 must support authorized aggregate views and requests across Workspaces,
not only a global switcher. Each displayed item retains its Workspace,
connection, Batch and execution identity. Permission checks cover every target.
If no approver can approve all included operations, creation is unavailable with
a useful reason. Do not gather independent per-Workspace approvals instead.

Credentials, Issue/PR DTOs, raw evidence parsing and transport remain in adapters.
Typed provider fields may appear where needed; GitHub links are secondary
evidence, not the user's primary task flow.

## Interaction Rules

- After a confirmed mutation, show the product detail and actual latest state,
  not an obsolete approve button or a forced trip to GitHub.
- Execution requests link to the exact execution detail when correlated, not
  merely to an unfiltered list. Change requests link to their Batch.
- Batch detail shows what runs, runtime, command/artifact, schedules and history.
  Gate is mandatory and compact; it is not an optional switch or oversized card.
- Disabled controls expose a concise accessible reason, ordinarily a tooltip.
- Business logs default to the actual batch-command region; full logs remain
  available. Gate denial is not business failure.
- Request withdrawal, queued cancellation and running stop use distinct
  confirmations. Ask before stopping running work, preserve reason, and wait for
  real engine evidence before displaying completion.
- Result synchronization is a separate read/repair command, never automatic
  re-execution or cancellation.
- Lists expose errors and partial scope; stale work must not disappear merely
  because the newest page is full. Use current direct-query behavior; no new
  caching layer is authorized here.
- English and Korean, keyboard interaction, desktop/mobile layout and connected
  navigation are checked for every affected screen under open #119.

The [QA sheet](./user-qa.ko.md) identifies which of these are current checks and
which await implementation. A mock Main fixture proves composition only.
