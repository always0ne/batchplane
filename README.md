# BatchPlane

[한국어](./README.ko.md)

Unified batch control and audit across execution platforms.

BatchPlane gives operators one controlled inventory for batch registration,
change, deletion, execution, schedules, Gate decisions, execution history, failure
follow-up, and audit evidence. GitHub Actions is the first supported platform;
Jenkins is the next provider used to prove the platform boundary. Other batch
platforms are planned through adapters validated against shared product contracts.

The product architecture defines two editions:

- **BatchPlane Main** is the planned Kotlin/Spring Boot control plane backed by
  MySQL. Its target supports multiple Workspaces and platform connections, including
  GitHub Actions.
- **BatchPlane Lite** is the currently implemented GitHub-native edition. It uses a repository, pull
  requests, Issues, comments, and Actions as its authority and requires no
  BatchPlane server.

Both editions share product semantics and the React/Vite product UI. Their
runtime bootstraps and authoritative stores differ.

Implementation availability is not operating acceptance. Main is planned;
Lite still has known request/input/query gaps and pending live schedule QA.
Use the [approved roadmap](docs/control-plane-migration-plan.md),
[requirements and issue mapping](docs/requirements-traceability.md), and
[user QA sheet](docs/user-qa.md) to track the remaining work.
Record actual results with the [QA result template](docs/qa-result-template.md).

## Development

This repository uses pnpm workspaces.

Before contributing, read the mandatory repository instructions in
[`AGENTS.md`](AGENTS.md) and the shared React application principles in
[`docs/frontend-engineering-principles.md`](docs/frontend-engineering-principles.md).

```bash
corepack prepare pnpm@10.14.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Run `pnpm dev` from the repository root. It builds the internal package
prerequisites, then starts one TypeScript package watcher alongside Vite.
Changes to package sources are rebuilt automatically. Stop both with Ctrl-C.
The Web app and TypeScript resolve internal packages through pnpm workspace
links and their declared `exports`, without source-path aliases or an extra
development plugin. Package `dist` directories are generated, not committed.

## Code Navigation

[Graphify](https://github.com/Graphify-Labs/graphify#installation) is an optional
local code-navigation tool, not a product dependency or CI requirement. Install
[uv](https://docs.astral.sh/uv/getting-started/installation/) first, then follow
Graphify's official Codex setup:

```bash
uv tool install graphifyy
uv tool update-shell
```

Open a new terminal so the tool directory is on `PATH`, then run:

```bash
graphify install --platform codex
```

From this repository's root, build a code-only graph without model extraction:

```bash
graphify extract . --code-only \
  --exclude '**/dist/**' --exclude '**/node_modules/**' \
  --exclude '**/coverage/**' --exclude 'docs/**' --exclude '*.local.*' \
  --exclude 'apps/web/src/shared/i18n/locales/**'
graphify cluster-only . --no-label
graphify codex install
```

The last command adds query-first guidance to `AGENTS.md` and generates local
Codex hook settings. Existing project instructions still apply. Graph artifacts
and machine-specific hook settings are ignored by Git.

```bash
graphify query "LiteSetupPage" --budget 1600
graphify explain useExecutionRunDetail
graphify path ExecutionRunDetailPage useExecutionRunDetail
graphify update .
```

In Codex, invoke the installed skill with `$graphify`, for example
`$graphify query LiteSetupPage`. A bare `$graphify .` requests a full graph build,
not a lookup; documents and media can involve model-based extraction. For
parallel extraction, Graphify requires Codex's `multi_agent` feature to be enabled.
Use graph results to locate relevant source, then read that source. An absent
graph relationship does not establish a missing implementation or a defect.

### Git Hooks

Install Graphify's official hooks once per clone, after building the graph:

```bash
graphify hook install
graphify hook status
```

The `post-commit` and `post-checkout` hooks update the code graph in the background
after commits and branch switches. They use AST extraction without model calls
and do not block Git while rebuilding. After `git pull` or `git merge`, run
`graphify update .` explicitly; these operations have no Graphify hook.

The installer also registers a repository-local merge driver and a
`.gitattributes` entry for `graphify-out/graph.json`. BatchPlane keeps graph
artifacts ignored, so they are not committed automatically. Git hooks are local
to the clone and are not installed merely by pulling this README.

Re-run `graphify hook install` after upgrading or reinstalling Graphify to refresh
the pinned Python path. Use `graphify hook uninstall` to remove the integration.
Reinstalling replaces the generated hooks, so any local Obsidian-export extension
must be reapplied afterward.

### Obsidian

Export the existing graph with Graphify's official exporter; no extra Obsidian
plugin or model extraction is required:

```bash
graphify export obsidian --dir "/path/to/your/Obsidian Vault"
```

This creates linked Markdown notes for graph nodes and communities, plus
`graph.canvas`. Open the destination vault in Obsidian to browse the graph,
search symbols, or follow links between notes. The exporter preserves existing
user notes and graph settings; it tracks its generated notes in
`.graphify_obsidian_manifest.json`. Keep personal annotations in separate notes
because generated notes are replaced on the next export.

This is a one-way export, not bidirectional synchronization. Graphify's official
Git hooks update only `graphify-out/graph.json`. A local extension can run the
export inside the existing background job, after `_rebuild_code` reports success.
The configured local checkout uses this extension for commits and branch
switches. Failed or skipped rebuilds do not export; export failures are logged
without failing Git. Output goes to `~/.cache/graphify-rebuild.log`.

This extension is a local edit to `.git/hooks`, not a Graphify setting or a hook
distributed by this repository. Other clones require their own setup. After
pulling or merging changes, refresh both explicitly from the repository root:

```bash
graphify update .
graphify export obsidian --dir "/path/to/your/Obsidian Vault"
```

## Local Verification

BatchPlane requires Node 24 or later. CI and the checked-in JavaScript Actions
use Node 24. `.node-version` provides the single version-manager hint. The
complete local verification sequence is:

```bash
corepack prepare pnpm@10.14.0 --activate
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --exit-code -- actions/dispatcher/dist actions/gate/dist actions/schedule-request/dist actions/schedule-result/dist
VITE_BASE_PATH=/batchplane/ pnpm --filter @batchplane/web build
git diff --check
```

Each JavaScript Action builds a self-contained Node 24 `dist/index.js` bundle.
The Action dist diff check fails when a build changed a tracked bundle that has
not been committed. Generated dispatcher, target, and scheduled workflow
behavior is covered by focused TypeScript tests, including the exact
single-quoted `github.event.schedule` expression. No Go toolchain is required.

These checks use deterministic fixtures and generated workflow tests only;
they do not prove a live GitHub repository cycle. Repository installation,
Issue/PR writes, approval evidence, dispatcher, Gate, Actions logs, and cron
trigger behavior still require the separate authorized Lite smoke test below.

## Lite Smoke Test

To test the GitHub-backed registration flow, create a private GitHub repository
that BatchPlane can write registration pull requests to.

```bash
gh repo create batch --private --add-readme
```

The repository must have an initial commit. Creating it with `--add-readme` is
the simplest path because BatchPlane creates registration branches from the
repository's default branch.

Create a fine-grained GitHub personal access token for the `batch` repository:

- Repository access: only the `batch` repository
- `Actions`: read-only
- `Contents`: read and write
- `Issues`: read and write
- `Pull requests`: read and write
- `Metadata`: read-only

Then open the local app and connect the repository:

```text
http://127.0.0.1:5173/
```

In `Workspace`, enter:

- Owner: your GitHub username or organization
- Repository: `batch`
- Token: the fine-grained personal access token

Use `Check connection` to save and verify the entered connection and inspect
whether the repository has BatchPlane Lite installed. Tokens are stored in
`sessionStorage` only. `Save session` alone does not verify connectivity.
Editing or clearing the connection requires another successful check before
creating installation, update or policy requests; those requests never save
connection fields implicitly.

If Lite is not installed, choose `Create installation request` in `Workspace`. The
installation pull request adds:

- `.github/workflows/batchplane-dispatcher.yml`
- `.github/workflows/batchplane-sample-target.yml`
- `.batch-governance/README.md`
- `.batch-governance/batches/.gitkeep`

Merge the installation pull request before testing execution approval. The
browser UI creates setup and request records, but approved execution dispatch is
performed by the target repository's dispatcher workflow.

To test batch registration, go to `Batches`, choose `Register batch`, fill in the
form, review the YAML preview, and choose `Create registration PR`. Registration
always generates a BatchPlane Gate-protected workflow. The workflow path is
derived from the Batch ID, the execution environment is selected through the
`runs-on` control, the batch command is the only command executed after Gate
approval, and schedules are embedded in the batch definition. A successful test
creates:

- A new `batchplane/register/...` branch
- `.batch-governance/batches/{batchId}.yml`
- `.github/workflows/{batchId}.yml`
- Optional `.batch-governance/batches/{batchId}/artifacts/...` execution files
- A pull request back to the default branch

To complete the registration approval cycle, go to `Approvals` and choose
`Approve and merge` for the generated PR. A successful approval records a
BatchPlane approval comment on the PR, squash-merges the PR into the default
branch, and removes the request from the approval inbox. Return to `Batches` and
choose `Refresh`; the approved batch definition should appear from the
repository's `.batch-governance/batches` directory.

To test schedule execution, include at least one enabled schedule during batch
registration or change approval. The approved revision authorizes unattended
execution; a schedule does not need another human approval for each occurrence.
The native scheduled workflow records an execution request, verifies Gate,
rechecks authority immediately before the batch command, and records the result
in the same workflow. It does not dispatch another workflow or fabricate an
approval comment. Scheduled occurrences appear in requests, runs and audit,
but not as approval work.

Generated schedules retain the original cron and native IANA timezone. Within
one batch, the same cron with different timezones is rejected because the
documented trigger context does not distinguish them. A source occurrence is
identified by the repository, batch, schedule and native Run, not an inferred
nominal time. Full and partial native reruns are denied; deduplication of
separate Runs for the same nominal slot is not guaranteed. GitHub may delay or
drop scheduled runs. See the [schedule execution contract](docs/schedule-execution-contract.md)
for trust boundaries and the separate live verification procedure.

Lite currently covers repository installation PR creation, registration
request, approval, merge, Workspace-backed batch listing, execution request creation,
execution approval evidence, and dispatcher-side `workflow_dispatch`. Target
repositories must merge the BatchPlane dispatcher workflow installation before
approval comments can trigger the dispatcher action.

To test the first execution-control entry point, choose `Request run` from an
approved batch in `Batches`. A successful request creates a GitHub Issue with a
BatchPlane execution request marker, canonical payload, and SHA-256 request
digest, then routes the UI to `Approvals`. Approving the execution request
records a BatchPlane execution approval comment whose first line is the
dispatcher command (`/bgcp approve ...`). The target repository still needs the
BatchPlane dispatcher workflow installed for that approval comment to perform
`workflow_dispatch`.

The dispatcher action checks that the execution request Issue and approval
comment reference the same request ID, batch ID, digest, approval decision,
expiration window, and workflow target before it performs `workflow_dispatch`.
By default, requester self-approval is blocked. A target repository may allow
single-user testing by setting `.batch-governance/workspace.yml` to
`SELF_APPROVAL_ALLOWED`; the approval comment and Gate verification still make
that self-approval explicit. `AUTO_APPROVE` is a higher relaxation level and
therefore also includes self-approval permission while recording automatic
Workspace-policy approval evidence.

See also:

- `BRAND_GUIDELINES.md`
- `docs/product-scope-and-editions.md`
- `docs/control-plane-srs.md`
- `docs/domain-model.md`
- `docs/control-plane-architecture.md`
- `docs/control-plane-ui-architecture.md`
- `docs/control-plane-architecture-review.md`
- `docs/platform-provider-contract.md`
- `docs/gate-protocol.md`
- `docs/identity-and-authorization.md`
- `docs/audit-and-evidence.md`
- `docs/main-lite-conformance.md`
- `docs/control-plane-migration-plan.md`
- `docs/adr/0001-modular-monorepo.md`
- `docs/repo-mode-getting-started.md`
- `docs/github-pages.md`
- `docs/i18n.md`
- `docs/github-lite-srs.md`
- `docs/github-lite-technical-spec.md`
- `docs/repository-rename-runbook.md`
- `examples/github-lite-demo/README.md`

## Current Lite Workspace

```text
apps/web                 Shared React/Vite product UI, current Lite runtime
packages/ui-client       Product client contract
packages/domain          Domain types and behavior
packages/digest          Canonical payload utilities
packages/github-lite     GitHub transport, evidence and Lite operations
actions/gate             Pre-business authorization
actions/dispatcher       Approved manual-request delivery
actions/schedule-request Native occurrence evidence
actions/schedule-result  Native occurrence outcome
```

The current boundaries and planned Main direction are defined in
`docs/control-plane-architecture.md`. The UI/client extraction is already the
baseline; Main contracts and platform integrations follow the approved roadmap
without repeating the refactoring or adding speculative modules.

## Internationalization

The default UI language is English. Korean is bundled by default. New languages
should be added by contributing locale JSON resources and updating the supported
locale registry.
