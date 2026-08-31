# BatchPlane

Unified batch control and audit across execution platforms.

BatchPlane gives operators one governed inventory for batch registration,
change, deletion, execution, schedules, Gate decisions, run history, failure
follow-up, and audit evidence. GitHub Actions is the first supported platform;
Jenkins is the next provider used to prove the platform boundary. Other batch
platforms can be added through versioned provider contracts.

The product architecture defines two editions:

- **BatchPlane Main** is the planned Kotlin/Spring Boot control plane backed by
  MySQL. It supports multiple Workspaces and platform connections, including
  GitHub Actions.
- **BatchPlane Lite** is the currently implemented GitHub-native edition. It uses a repository, pull
  requests, Issues, comments, and Actions as its authority and requires no
  BatchPlane server.

Both editions share product semantics and the React/Vite feature UI. Their
runtime bootstraps and authoritative stores differ.

## Development

This repository uses pnpm workspaces.

```bash
corepack prepare pnpm@10.14.0 --activate
pnpm install
pnpm dev
```

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

Use `Save session`, then `Check connection`. Tokens are stored in
`sessionStorage` only. Connection check also inspects whether the repository has
BatchPlane Lite installed.

If Lite is not installed, choose `Create installation PR` in `Workspace`. The
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

To test the current 0.x schedule flow, include at least one enabled schedule
during batch registration or change approval. After merge, the generated cron
job creates occurrence-specific Issue evidence, writes the legacy
`SCHEDULE_DELEGATED` compatibility marker, and calls the dispatcher. It does not
wait in `Approvals`. This compatibility representation is being replaced by
the v2 contract in `docs/github-lite-srs.md`: the merged Schedule Revision is
the authority, and a scheduled occurrence reaches Gate in the same native run
without fabricating approval. GitHub Actions scheduled workflows run from the
latest default-branch commit, have a minimum five-minute interval, and can be
delayed or dropped under high load.

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
- `docs/repo-mode-getting-started.md`
- `docs/github-pages.md`
- `docs/i18n.md`
- `docs/github-lite-srs.md`
- `docs/github-lite-technical-spec.md`
- `docs/repository-rename-runbook.md`
- `examples/github-lite-demo/README.md`

## Current Lite Workspace

```text
apps/web              React/Vite Lite UI
packages/domain       Shared domain types
packages/digest       Canonical payload utilities
packages/github-lite  GitHub Lite client contracts
actions/gate          BatchPlane Gate Action scaffold
actions/dispatcher    BatchPlane Dispatcher Action scaffold
```

The target modular-monolith and provider layout is defined in
`docs/control-plane-architecture.md`. The migration deliberately keeps this
Lite workspace runnable while product contracts, UI ports, Kotlin Main modules,
and platform providers are extracted in reviewable phases.

## Internationalization

The default UI language is English. Korean is bundled by default. New languages
should be added by contributing locale JSON resources and updating the supported
locale registry.
