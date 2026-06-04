# BatchPlane

Git-backed batch control and audit.

BatchPlane starts with **Lite**, a GitHub repository-backed way to model batch
definitions, execution requests, approval evidence, dispatcher workflows, and Gate
decisions. It is designed to grow into an installable BatchPlane server for
enterprise use.

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

In `Setup`, enter:

- Owner: your GitHub username or organization
- Repository: `batch`
- Token: the fine-grained personal access token

Use `Save session`, then `Check connection`. Tokens are stored in
`sessionStorage` only. Connection check also inspects whether the repository has
BatchPlane Lite installed.

If Lite is not installed, choose `Create installation PR` in `Setup`. The
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
registration or change approval. After the registration PR is merged, GitHub
Actions cron triggers create one execution request Issue per occurrence,
record delegated approval evidence automatically, and dispatch the governed
workflow through the same Gate-protected path as manual requests. Scheduled
occurrences do not wait in `Approvals`; they appear as execution request/audit
evidence and in execution run history. GitHub Actions scheduled workflows run
from the latest commit on the repository's default branch, support a minimum
interval of 5 minutes, and may be delayed during high-load periods.

Lite currently covers repository installation PR creation, registration
request, approval, merge, repo-backed batch listing, execution request creation,
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
that self-approval explicit.

See also:

- `BRAND_GUIDELINES.md`
- `docs/repo-mode-getting-started.md`
- `docs/github-pages.md`
- `docs/github-lite-srs.md`
- `docs/github-lite-technical-spec.md`
- `docs/repository-rename-runbook.md`
- `examples/github-lite-demo/README.md`

## Workspace

```text
apps/web              React/Vite Lite UI
packages/domain       Shared domain types
packages/digest       Canonical payload utilities
packages/github-lite  GitHub Lite client contracts
actions/gate          BatchPlane Gate Action scaffold
actions/dispatcher    BatchPlane Dispatcher Action scaffold
```

## Internationalization

The default UI language is English. Korean is bundled by default. New languages
should be added by contributing locale JSON resources and updating the supported
locale registry.
