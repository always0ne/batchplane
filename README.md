# BatchTrail

Git-native Batch Control & Audit.

BatchTrail starts with **Repo Mode**, a GitHub repository-backed way to model batch
definitions, execution requests, approval evidence, dispatcher workflows, and Gate
decisions. It is designed to grow into **BatchTrail Control Plane** for installable
enterprise use.

## Development

This repository uses pnpm workspaces.

```bash
corepack prepare pnpm@10.14.0 --activate
pnpm install
pnpm dev
```

## Repo Mode Smoke Test

To test the GitHub-backed registration flow, create a private GitHub repository
that BatchTrail can write registration pull requests to.

```bash
gh repo create batch --private --add-readme
```

The repository must have an initial commit. Creating it with `--add-readme` is
the simplest path because BatchTrail creates registration branches from the
repository's default branch.

Create a fine-grained GitHub personal access token for the `batch` repository:

- Repository access: only the `batch` repository
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
`sessionStorage` only.

To test batch registration, go to `Batches`, choose `Register batch`, fill in the
form, review the YAML preview, and choose `Create registration PR`. A successful
test creates:

- A new `batchtrail/register/...` branch
- `.batch-governance/batches/{batchId}.yml`
- A pull request back to the default branch

To complete the registration approval cycle, go to `Approvals` and choose
`Approve and merge` for the generated PR. A successful approval records a
BatchTrail approval comment on the PR, squash-merges the PR into the default
branch, and removes the request from the approval inbox. Return to `Batches` and
choose `Refresh`; the approved batch definition should appear from the
repository's `.batch-governance/batches` directory.

Repo Mode currently covers registration request, approval, merge, and
repo-backed batch listing. Dispatch and Gate enforcement are implemented in
later slices.

To test the first execution-control entry point, choose `Request run` from an
approved batch in `Batches`. A successful request creates a GitHub Issue with a
BatchTrail execution request marker, canonical payload, and SHA-256 request
digest. Go to `Approvals` to approve or reject the execution request. A
successful decision records a BatchTrail execution approval comment and closes
the Issue so it leaves the approval inbox. Dispatcher handoff and Gate
verification are added in later slices.

## Workspace

```text
apps/web              React/Vite Repo Mode UI
packages/domain       Shared domain types
packages/digest       Canonical payload utilities
packages/github-lite  GitHub Repo Mode client contracts
actions/gate          BatchTrail Gate Action scaffold
actions/dispatcher    BatchTrail Dispatcher Action scaffold
```

## Internationalization

The default UI language is English. Korean is bundled by default. New languages
should be added by contributing locale JSON resources and updating the supported
locale registry.
