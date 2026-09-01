# Frontend Engineering Principles

## Status

This document is the mandatory engineering baseline for the shared BatchPlane
React application. It applies to both Lite and Main UI development. Root
`AGENTS.md` contains the short enforcement checklist and points here for the
complete contract.

These rules translate the current React documentation into BatchPlane's product
and repository constraints. React does not prescribe a canonical folder tree.
The structure below is a deliberate BatchPlane decision based on React's
component hierarchy, state ownership, purity, Effects, and custom Hook guidance.

Primary React references:

- [Thinking in React](https://react.dev/learn/thinking-in-react)
- [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer)
- [Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context)
- [Keeping Components Pure](https://react.dev/learn/keeping-components-pure)

## Product Principle

The user journey is more important than an isolated screen or folder. A change
must be understood from entry point through authorization, action, resulting
state, navigation, audit evidence, failure handling, and follow-up work. A screen
is not complete merely because its local controls render or call an API.

BatchPlane is a multi-platform batch control and audit product. GitHub Actions is
the first provider, not the product model. Shared UI must therefore speak in
Workspace, Batch, governed change, approval, execution, schedule, failure, and
audit concepts rather than GitHub transport concepts.

## Target Source Structure

```text
apps/web/src/
  app/       router, top-level providers, and application composition
  pages/     route screens, page queries, composition, and navigation
  features/  reusable complete user actions
  ui/        product-agnostic visual primitives and interaction patterns
  client/    provider-neutral React access to the injected product client
  assets/    BatchPlane brand and product-specific visual assets
  runtime/   Lite/Main implementation selection and client injection
  shared/    non-visual product-neutral support such as i18n
```

`features` is not a synonym for pages and is not a folder for every product
noun. A route-ready Batch list belongs in `pages/batches`. An execution approval
interaction that is used in an approval inbox and request detail belongs in
`features/execution-approval`.

The target dependency direction is:

```text
app -> pages -> features -> ui
 |       |          |
 +-------+----------+----> client -> packages/ui-client

runtime -> packages/github-lite -> packages/ui-client
```

The arrows describe imports. Lower layers do not import route pages or app
composition. A page does not import another page. A feature does not import a
page. A page composes multiple features instead of coupling features directly.

## Migration Status

This repository is transitioning from its original domain-folder structure to
the target structure above. PR #198 establishes the Batch list as the first
completed vertical slice; the remaining `*Page.tsx` files under `features` are
legacy placement, not examples for new work.

| Surface                         | Current Page                                                 | Status                                                                                                      |
| ------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Batch list                      | `pages/batches/BatchesPage.tsx`                              | Migrated; first reference slice                                                                             |
| Dashboard                       | `features/dashboard/DashboardPage.tsx`                       | Legacy route Page; migration pending                                                                        |
| My Work                         | `features/my-work/MyWorkPage.tsx`                            | Legacy route Page; migration pending                                                                        |
| Batch registration and change   | `features/registration/BatchRegistrationPage.tsx`            | Legacy route Page; migration pending                                                                        |
| Batch detail                    | `features/batches/BatchDetailPage.tsx`                       | Legacy route Page; migration pending                                                                        |
| Execution request creation      | `features/execution-requests/ExecutionRequestPage.tsx`       | Legacy route Page; migration pending                                                                        |
| Execution request detail        | `features/execution-requests/ExecutionRequestDetailPage.tsx` | Legacy route Page; migration pending                                                                        |
| Execution run list and failures | `features/execution-requests/ExecutionRunListPage.tsx`       | Legacy route Page; migration pending                                                                        |
| Execution run detail            | `features/execution-requests/ExecutionRunDetailPage.tsx`     | Legacy route Page; migration pending                                                                        |
| Workspace requests              | `features/requests/WorkspaceRequestsPage.tsx`                | Legacy route Page; migration pending                                                                        |
| Approvals                       | `features/approvals/ApprovalsPage.tsx`                       | Legacy route Page; migration pending                                                                        |
| Registration approval detail    | `features/approvals/RegistrationApprovalDetailPage.tsx`      | Legacy route Page; migration pending                                                                        |
| Audit                           | `features/audit/AuditPage.tsx`                               | Legacy route Page; migration pending                                                                        |
| Workspace connection and setup  | `features/lite-setup/LiteSetupPage.tsx`                      | Legacy route Page; migration pending                                                                        |
| Standalone schedule definition  | `features/schedules/ScheduleDefinitionPage.tsx`              | Legacy Page module not connected to the current App router; evaluate removal or reuse in the schedule slice |

New route screens must start under `pages`; the legacy paths above do not
authorize adding another Page to `features`. A migration is complete only when
the route composition, page-only state and components, product-client boundary,
and tests follow this document. Moving a file without separating those
responsibilities is not a completed slice.

Update this inventory in the same pull request that migrates, removes, or
reconnects one of these Pages. Migrations remain vertical and reviewable; this
table is not a reason to perform a cosmetic mass move.

## Page Contract

A Page is a route boundary. It may:

- read route parameters and query parameters;
- call a page-local query or command Hook;
- compose page-local components and reusable features;
- choose loading, error, empty, disconnected, and success presentation;
- navigate using authoritative results returned by commands.

A Page must not:

- call raw GitHub APIs or create a GitHub client;
- know tokens, REST DTOs, Issue or pull request body formats, branches, repository
  paths, YAML evidence, workflow event payloads, or provider-specific errors;
- implement authorization, approval, Gate, scheduling, or audit policy;
- contain transport, parsing, policy, form state, and all JSX in one large
  function.

A healthy Page reads as screen composition:

```tsx
export function BatchesPage() {
  const batchList = useBatchList();

  return (
    <PageLayout>
      <BatchListToolbar
        isRefreshing={batchList.state.type === "loading"}
        onRefresh={batchList.refresh}
      />
      <BatchListContent state={batchList.state} />
    </PageLayout>
  );
}
```

## Feature Contract

A Feature represents a complete user action with product value, such as
approving an execution, submitting a failure explanation, or previewing a
governed change. It may contain a component, a concrete custom Hook, and focused
pure presentation rules.

A Feature should exist when the action is used across pages or when a stable
interaction contract clearly deserves independent ownership. Similar markup is
not enough. Do not move one-off page sections into `features` merely to shorten a
file.

Features consume product-facing client contracts and UI primitives. They do not
parse provider evidence or import other features to build an implicit workflow.
The Page owns cross-feature composition.

## UI Contract

`ui` is the local design foundation. Its components do not understand Batch,
Approval, GitHub, Gate, or any other product/provider concept. They accept
bounded visual and interaction variants such as tone, size, disabled, loading,
label, and accessible description.

The initial foundation should grow from observed repetition and stable product
needs. Expected early primitives include:

- Button and IconButton;
- FormField, TextField, SelectField, and TextAreaField;
- Tooltip;
- PageHeader and PageState;
- stable status presentation primitives whose inputs are visual tones, not
  domain status values.

Tailwind remains an implementation detail. Semantic CSS variables and bounded
component variants prevent every Page from recreating raw class combinations.
Do not build a generic form builder, generic data-table engine, polymorphic
component framework, or separate design-system package before a real second
consumer or demonstrated complexity exists.

Page-local visual components remain beside their Page until their contract is
proven reusable. A component may still be extracted for naming, readability,
state isolation, or testing even if it has one caller.

## Assets And Icons

BatchPlane brand assets belong under `assets/brand` once migrated from the
legacy public asset layout. The mark, lockup, and edition variants must share a
defined naming and spacing convention. Images must not contain translatable
product copy.

Use Lucide icons for familiar interface actions. Do not redraw familiar icons.
Custom SVGs are reserved for BatchPlane-specific marks or visuals. Icon-only
controls need accessible labels and tooltips when their meaning is not obvious.

## State Ownership

State is the smallest set of changing information the UI must remember.

- Derive filtered lists, counts, labels, and readiness from props or state during
  render rather than storing synchronized copies.
- Group values that always transition together and avoid contradictory boolean
  combinations.
- Keep state at the closest component that clearly owns it. Lift it only when
  multiple descendants need the same source of truth.
- Start with `useState`. Use a reducer only when related transitions are spread
  across handlers and a named action model makes the flow easier to understand.
- Reducers are pure and never perform requests, navigation, timers, or storage
  writes.
- Context is for a real tree-wide dependency or distant shared state. It is not
  the default answer to prop passing.

`BatchPlaneClient` is an application-wide dependency, so a narrowly scoped
provider and `useBatchPlaneClient` Hook under `client` are appropriate. Keeping
this React bridge outside `app` prevents pages from importing the composition
layer that already imports them. Page form data, dialog visibility, and table
filters are not automatically global context.

## Effects, Events, And Custom Hooks

Rendering stays pure. Work caused by a user action starts in that event handler.
Effects synchronize the mounted UI with an external system or component
lifetime. Do not use Effects to derive display data or route a user action
through a second state change.

Custom Hooks make concrete stateful flows readable. Placement follows ownership:

```text
page-only       pages/batches/useBatchList.ts
shared action   features/execution-approval/useExecutionApproval.ts
generic browser shared/hooks/useMediaQuery.ts
pure calculation ordinary function without a use prefix
```

Avoid lifecycle-wrapper Hooks, a global miscellaneous Hooks folder, Hooks that
do not call Hooks, or one giant Hook that merely hides a giant Page. A Hook name,
inputs, result, and side effects must describe one high-level purpose.

Lite queries call the injected client when a screen is entered or explicitly
refreshed. Do not add a cache without an approved product requirement. Async
Hooks must prevent stale or unmounted requests from overwriting the current
screen state.

## Product Client And Adapters

Pages and features use `packages/ui-client` product contracts. Queries return
provider-neutral view models. Commands return the authoritative product result
needed for immediate internal navigation and display.

The UI does not receive raw GitHub objects as product objects. GitHub API calls,
transport DTOs, Issue and pull request evidence, repository files, YAML, and
workflow logs are decoded in `packages/github-lite` or another bounded adapter.
Main implements the same product client through its Kotlin-backed API.

Provider-specific connection settings may appear only within a bounded
connection capability. They must not leak into shared Batch, approval, run,
failure, or audit screens.

## Readability

Code is maintained by people before it is optimized for abstraction count.

- Names read like prose and state intent.
- Each function is understandable within one screen.
- A file owns one cohesive responsibility.
- Broad `model.ts`, `utils.ts`, `helpers.ts`, and large barrel files are not used
  as dumping grounds.
- Comments explain a non-obvious policy or reason, not the syntax below them.
- Hidden side effects and clever generic APIs are rejected in favor of explicit
  product language.

Splitting is based on responsibility, not a mechanical line limit. Moving a
1,000-line Page into a 1,000-line Hook is not a refactor.

## Tests

Co-locate focused unit, Hook, and component tests with the implementation they
protect. Put cross-page integration and browser end-to-end tests in dedicated
test areas.

Tests assert observable states and public contracts:

- loading, disconnected, error, empty, and success;
- enabled, disabled, loading, and failure actions;
- internal navigation and authoritative command results;
- English and Korean copy behavior where layout or meaning can differ;
- stale async result protection when relevant;
- provider-neutral client boundaries.

Do not create production exports only to test implementation details. Prefer
realistic component tests for behavior and direct tests for complex pure
reducers or policy-free presentation functions.

## UI And UX Definition Of Done

A screen change is complete only when:

- its place in the end-to-end user journey is coherent;
- Page, Feature, UI, client, and adapter boundaries are respected;
- loading, disconnected, error, empty, and success states are handled;
- disabled actions communicate the reason, normally through the agreed tooltip
  pattern;
- internal product work navigates inside BatchPlane instead of sending the user
  to GitHub when BatchPlane can complete the work;
- English and Korean, long text, desktop, and mobile layouts are checked;
- keyboard operation, focus visibility, labels, and semantic controls are
  preserved;
- the current UI/UX baseline in `docs/lite-ui-ux-baseline.md` and open issue #119
  are reviewed;
- the complete local verification sequence in `README.md` passes.

## Evolution And Non-Goals

Refactor through complete vertical slices. A slice should leave a working user
path, preserve current behavior unless a defect is explicitly in scope, and be
small enough to review honestly.

Do not introduce the following without an observed need and explicit approval:

- a framework migration or React-version migration bundled with refactoring;
- a state or query library and implicit cache;
- Storybook or a separate design-system package;
- generic provider SDKs or methods for providers not yet implemented;
- empty layers, code generation, speculative interfaces, or duplicate policy;
- broad visual redesign hidden inside an architecture-only change.

The UI foundation is built before raw patterns are repeated, but it is validated
through a real screen rather than completed as a speculative catalogue. The
Batch list is the first proof surface.

## Pull Request Checklist

- [ ] The approved vertical scope and explicit non-goals are stated.
- [ ] Route screens live in `pages`; reusable user actions live in `features`.
- [ ] Page-only Hooks and components are co-located with their Page.
- [ ] UI code depends on `BatchPlaneClient`, not provider internals.
- [ ] Render is pure; events and Effects have the correct ownership.
- [ ] State is minimal and has one clear owner.
- [ ] Functions and files remain readable without speculative abstractions.
- [ ] Tests cover the relevant observable states and remain correctly located.
- [ ] UI/UX, accessibility, English/Korean, desktop/mobile checks are complete.
- [ ] Verification matches the changed risk: full local verification for code,
      configuration, dependency, or build changes; focused document checks for
      documentation-only changes.
- [ ] No unrelated feature, dependency, cache, framework, or design-system scope
      was added.
