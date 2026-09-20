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
- When a local execution ledger exists, read its current entry and linked
  active plan before starting, resuming, or delegating work. Confirm the current
  work item, approval boundary, non-goals, and next step against the checkout.
  Update the active plan at work-item completion, a scope decision, handoff, or
  interruption. Record evidence and remaining work; do not mark implementation,
  validation, delivery, and user merge as the same state. Do not choose another
  issue merely because it is easier or nearby.
- Match verification to the risk changed. Code, configuration, dependency, and
  build changes require the complete local verification sequence documented in
  `README.md`. Documentation-only changes require only relevant document
  formatting, content, link, and diff checks; do not run application builds or
  tests when they cannot validate the change. UI work also requires browser
  review at desktop and mobile widths in English and Korean.

## Official Patterns Are Mandatory

- Follow React's official guidance and the official recommended patterns of
  each library used. This is a required implementation and review criterion,
  not an optional style preference.
- Before designing or changing an integration, check the installed version and
  its official documentation. Distinguish recommendations from supported
  alternatives and examples; do not invent an official folder or naming rule.
- Use the library's established APIs and composition model before introducing
  project-specific wrappers or abstractions for the same responsibility.
- When several official patterns are supported, choose the simplest one that
  fits the approved product requirements and explain meaningful tradeoffs.
  A newer pattern alone does not authorize upgrades or a framework migration.
- Deviations require a concrete constraint, comparison with the official
  approach, and explicit user approval before implementation. Include the
  relevant official reference and decision in the design or PR.
- Worker instructions and final review must enforce this rule. Passing tests,
  shorter files, or fewer lines do not establish architectural acceptance.

## Product And Runtime Boundaries

- Lite and Main must share the same React product UI source and product
  semantics. They may not share runtime implementations or deployment artifacts.
- React pages and their business components depend on the provider-neutral
  `BatchPlaneClient`.
  They must not access GitHub tokens, REST DTOs, Issues, pull requests, branches,
  repository paths, YAML evidence, or raw workflow data directly.
- Provider-specific transport, evidence parsing, and repository behavior belong
  in the appropriate adapter, initially `packages/github-lite`.
- Do not duplicate authorization, approval, scheduling, Gate, or audit policy in
  UI code. Product policy has one authoritative definition.

## Frontend Structure

- `app` owns routing, providers, and composition.
- Organize `pages` by business ownership so a maintainer can find related code
  by browsing folders, not only searching symbols. Keep route screens, their
  components, Hooks and tests together under the owning business area.
- Group request code under `pages/requests/execution` and `pages/requests/changes`.
  Reuse from another screen does not change ownership: the approval inbox may
  use the execution request's approval control without moving it to a global folder.
- `components` contains genuinely product-neutral common components such as
  Button and PageState, plus their tests and existing visual tokens. Do not use
  a separate `ui` folder inside this already-UI application, or a `features` layer.
- `client` is the provider-neutral React bridge to `packages/ui-client`. It owns
  the narrow Context and Hook used to access the injected `BatchPlaneClient`.
- `assets` owns brand and product-specific visual assets.
- `runtime` owns Lite/Main implementation selection and dependency injection.
- `shared` is limited to non-visual, product-neutral support such as i18n and
  generic formatting. Do not turn it into a miscellaneous folder.
- App composes route Pages. Pages may reuse another business area's owned
  components, but must not import that area's route Page or app composition.
  Business UI uses `client -> packages/ui-client`. Global common components
  must not depend on business folders, product/provider models or app composition.
  Share at the narrowest actual business scope; do not add an empty common folder.

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
  page, component-owned Hooks beside the component, and truly generic browser
  Hooks under `shared/hooks`.
- Do not create lifecycle-wrapper Hooks, a global dumping-ground `hooks` folder,
  or Hooks for functions that do not call Hooks.

## Components And UI Foundation

- A page should read as route and screen composition, not as transport,
  parsing, policy, and rendering in one function.
- Extract page-local components when they name a meaningful visual region,
  isolate interaction or state, improve readability, or deserve focused tests.
- Keep business components with their owner even when reused elsewhere. Promote
  code to global `components` only when its responsibility is genuinely common
  and its contract is stable. Reuse count or visual resemblance alone is not enough.
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
- Read the changed flow as a maintainer: names, inputs, side effects, and results
  must be understandable without reconstructing an unnecessary wrapper chain.
  Review long functions and files explicitly; move a coherent responsibility,
  not a giant function into a new Hook or service. A pure declaration list may
  be longer than executable logic; smaller files alone are not a success metric.
- Do not mechanically create one file per function or type. Closely related
  operations may stay together. Any retained oversized unit needs a concrete
  readability reason in the review, not a new generic framework to hide it.
- Co-locate unit, Hook, and component tests with their implementation. Put
  cross-page integration and browser end-to-end tests in dedicated test areas.
- Test observable behavior and public client contracts, not incidental internal
  calls. Preserve loading, error, empty, disconnected, success, disabled,
  localization, and navigation states as applicable.
- Every UI change must be checked against `docs/lite-ui-ux-baseline.md` and the
  open UI/UX baseline issue #119 while that review remains active.

## No Overengineering

- Distinguish verified defects, explicit requirements, and unverified
  hypotheses. Never describe a hypothetical state as an observed defect.
- Do not invent threats or exceptional states to justify defensive branches,
  new states, abstractions, compatibility paths, or additional backlog work.
  Before proposing mitigation, identify a reachable path or documented trust
  boundary in the current system and its concrete impact. A demonstrated risk
  does not require a production incident, but speculation alone is not evidence.
- When evidence is missing, perform only proportionate investigation. Do not
  implement the hypothetical case or expand the approved scope. Present any
  justified out-of-scope change, its minimum solution and cost for user approval.
  Apply this rule to planning, worker instructions, and review alike.
- Add only the boundaries required by current product behavior and the approved
  next vertical slice.
- Preserve future Lite/Main and platform boundaries by assigning current
  responsibilities correctly. Do not implement future engines, speculative
  extension points, unreachable defensive paths, or hypothetical fallbacks.
  Do not remove an existing authorization or input check merely to simplify
  code; establish its callers and trust boundary first.
- Do not add empty layers, speculative interfaces, future-provider methods,
  framework migrations, caches, generators, or convenience abstractions without
  an observed problem and explicit approval.
- Refactor in complete, reviewable vertical slices. Preserve behavior unless a
  separately identified defect or approved product change is in scope.
