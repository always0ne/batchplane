# BatchPlane Mandatory Engineering Instructions

These instructions are mandatory for every change in this repository. Read
`docs/frontend-engineering-principles.md` before changing the Web application.
The detailed document is the source of truth for rationale and examples; this
file is the enforcement checklist.

## Decision And Delivery

- Do not start implementation until the user has approved the concrete scope,
  affected behavior, dependency direction, UX impact, and explicit non-goals.
- Sol owns architecture, product judgment, and final review. Terra owns code
  implementation unless the user explicitly changes that assignment.
- Start new work from an updated `main`, inspect all existing planned issues and
  priorities before creating another issue, and avoid duplicate backlog items.
- Never merge a pull request. Remote CI result tracking and merge decisions
  belong to the user.
- Before commit or push, run the complete local verification sequence documented
  in `README.md`. UI work also requires browser review at desktop and mobile
  widths in English and Korean.

## Product And Runtime Boundaries

- Lite and Main must share the same React product UI source and product
  semantics. They may not share runtime implementations or deployment artifacts.
- React pages and features depend on the provider-neutral `BatchPlaneClient`.
  They must not access GitHub tokens, REST DTOs, Issues, pull requests, branches,
  repository paths, YAML evidence, or raw workflow data directly.
- Provider-specific transport, evidence parsing, and repository behavior belong
  in the appropriate adapter, initially `packages/github-lite`.
- Do not duplicate authorization, approval, scheduling, Gate, or audit policy in
  UI code. Product policy has one authoritative definition.

## Frontend Structure

- `app` owns routing, providers, and composition.
- `pages` owns route screens, route input, page queries, page composition, and
  navigation.
- `features` contains only complete user actions that are genuinely reused or
  composed across pages. It is not a bucket for route pages or product nouns.
- `ui` contains product-agnostic visual primitives and stable interaction
  patterns. It must not know BatchPlane domain or provider concepts.
- `client` is the provider-neutral React bridge to `packages/ui-client`. It owns
  the narrow Context and Hook used to access the injected `BatchPlaneClient`.
- `assets` owns brand and product-specific visual assets.
- `runtime` owns Lite/Main implementation selection and dependency injection.
- `shared` is limited to non-visual, product-neutral support such as i18n and
  generic formatting. Do not turn it into a miscellaneous folder.
- Dependencies flow `app -> pages -> features -> ui`. App, pages, and features
  may use `client -> packages/ui-client`. Lower layers must never import pages or
  app composition.
- A page must not import another page. A feature must not import a page. Pages
  compose multiple features instead of features importing one another.

## React Rules

- Use function components and Hooks.
- Keep render pure. Start user-caused work in event handlers. Use Effects only
  to synchronize with external systems or component lifetime.
- Store the minimum state. Derive values during render instead of synchronizing
  redundant state with Effects.
- Keep state at its closest clear owner. Use Context only for a real tree-wide
  dependency or distant shared state. Use reducers only for genuinely complex
  related state transitions.
- Give custom Hooks concrete, high-level names. Keep page-only Hooks beside the
  page, reusable business Hooks beside the feature, and truly generic browser
  Hooks under `shared/hooks`.
- Do not create lifecycle-wrapper Hooks, a global dumping-ground `hooks` folder,
  or Hooks for functions that do not call Hooks.

## Components And UI Foundation

- A page should read as route and screen composition, not as transport,
  parsing, policy, and rendering in one function.
- Extract page-local components when they name a meaningful visual region,
  isolate interaction or state, improve readability, or deserve focused tests.
- Promote code to `features` or `ui` only after its semantic contract is stable.
  Visual resemblance alone is not proof of reusable behavior.
- Establish a small semantic token, asset, and UI primitive foundation before
  repeating raw controls across screens. Grow it through real product screens;
  do not predict every future component.
- Tailwind is an implementation detail behind stable UI components. Do not make
  every page recreate button, field, focus, loading, disabled, or status styles.
- Use Lucide for familiar icons. Reserve custom SVGs for BatchPlane-specific
  marks and assets. Never embed translatable text in images.
- Do not create a separate design-system package, Storybook installation,
  generic form engine, generic table engine, or state/query library without a
  demonstrated need and explicit user approval.

## Readability And Tests

- Names must read like prose and state intent. Avoid broad `model`, `utils`,
  `helpers`, and large barrel files that hide unrelated responsibilities.
- Keep each function understandable within one screen. Split by responsibility,
  not arbitrary line counts or anticipated reuse.
- Co-locate unit, Hook, and component tests with their implementation. Put
  cross-page integration and browser end-to-end tests in dedicated test areas.
- Test observable behavior and public client contracts, not incidental internal
  calls. Preserve loading, error, empty, disconnected, success, disabled,
  localization, and navigation states as applicable.
- Every UI change must be checked against `docs/lite-ui-ux-baseline.md` and the
  open UI/UX baseline issue #119 while that review remains active.

## No Overengineering

- Add only the boundaries required by current product behavior and the approved
  next vertical slice.
- Do not add empty layers, speculative interfaces, future-provider methods,
  framework migrations, caches, generators, or convenience abstractions without
  an observed problem and explicit approval.
- Refactor in complete, reviewable vertical slices. Preserve behavior unless a
  separately identified defect or approved product change is in scope.
