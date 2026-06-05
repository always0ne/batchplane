# BatchPlane Lite Workspace Getting Started

BatchPlane Lite uses a GitHub-backed Workspace as the governance store,
approval surface, dispatcher runtime, and audit trail. The React/Vite UI is
static; it does not run a BatchPlane server. In Lite, the Workspace is backed by
one target GitHub repository.

This guide covers the first complete Lite path:

1. Prepare a target GitHub repository for the Workspace.
2. Connect it from the Workspace screen.
3. Install BatchPlane Lite repository files.
4. Register a batch through a pull request.
5. Request and approve execution.
6. Verify dispatcher, Gate, and run-history evidence.

## Prerequisites

- A GitHub repository with an initial commit.
- GitHub Actions enabled for the repository.
- Permission to create branches, pull requests, issues, labels, and comments.
- Permission to read GitHub Actions workflows, runs, jobs, and logs.
- Branch protection or repository rules that prevent direct default-branch
  changes for production-like use.

For a local smoke test, a private repository is enough:

```bash
gh repo create batch --private --add-readme
```

## Token Scope

Create a fine-grained GitHub personal access token for only the target
repository.

Required repository permissions:

- `Actions`: read-only
- `Contents`: read and write
- `Issues`: read and write
- `Pull requests`: read and write
- `Metadata`: read-only

Why each permission is needed:

- `Actions` read is used to list workflows, workflow runs, jobs, and transient
  job logs.
- `Contents` write is used to create setup, registration, change, deletion,
  workflow-update, and policy-update pull-request branches.
- `Issues` write is used for execution request Issues, labels, approval
  comments, rejection comments, dispatcher evidence, and failure follow-up
  evidence.
- `Pull requests` write is used for installation, registration, change,
  deletion, and Workspace policy pull requests.
- `Metadata` is required by GitHub APIs and repository identity checks.

If organization policy blocks repository collaborator or team membership reads,
approval-role checks may fail even when the token can open Issues and pull
requests. In that case, adjust organization token policy or repository access
before testing approval.

## Session Storage Policy

The Lite UI stores the GitHub connection in `sessionStorage` only.

- The token is not written to localStorage.
- The token is not written to GitHub Issues, pull requests, workflow files, or
  batch definitions.
- The token is cleared when the browser session is cleared, and it can be
  removed from the Workspace screen.
- Because Lite runs in the browser, only use trusted BatchPlane builds and avoid
  browser extensions or injected scripts that can read page storage.

The repository-side `GITHUB_TOKEN` is separate from the browser token. The
dispatcher and Gate actions use repository workflow permissions after the setup
PR is merged.

## Connect The Workspace

Open the Lite UI and go to Workspace.

Enter:

- Owner: GitHub user or organization
- Repository: target GitHub repository name
- Token: fine-grained token

Choose `Save session`, then `Check connection`.

The connection check reads:

- repository metadata and default branch
- required BatchPlane Lite installation files
- generated workflow drift for managed setup workflows
- Workspace policy if installed

## Install BatchPlane Lite

The target repository is installed when the default branch contains:

```text
.github/workflows/batchplane-dispatcher.yml
.github/workflows/batchplane-sample-target.yml
.batch-governance/README.md
.batch-governance/workspace.yml
.batch-governance/policies/role-mapping.yml
.batch-governance/batches/.gitkeep
```

If any required file is missing, choose `Create installation PR` in Workspace.
Review and merge the pull request in GitHub.

If required files exist but generated workflow files are outdated, Workspace
shows the affected workflow paths and offers `Create workflow update PR`. That
update only changes managed workflow files:

```text
.github/workflows/batchplane-dispatcher.yml
.github/workflows/batchplane-sample-target.yml
```

It must not overwrite repository-owned policy files such as
`.batch-governance/workspace.yml` or
`.batch-governance/policies/role-mapping.yml`.

For a quick target-repository skeleton, copy
`examples/github-lite-demo/.batch-governance` and
`examples/github-lite-demo/.github` into a target repository, commit, and push.
The Workspace installation PR flow is still the preferred production-like path
because it leaves native pull-request review evidence.

## Workspace Policy

Workspace approval mode is stored in:

```text
.batch-governance/workspace.yml
```

Default:

```yaml
apiVersion: "batchplane.io/v1"
kind: "WorkspacePolicy"
metadata:
  id: "default"
spec:
  approval:
    mode: "SELF_APPROVAL_BLOCKED"
```

Supported approval modes:

- `SELF_APPROVAL_BLOCKED`: default four-eyes control. Requester and approver
  must be different users. Use this for audit-heavy or production-like
  Workspaces.
- `SELF_APPROVAL_ALLOWED`: requester may approve their own execution request.
  Use this for personal testing, demos, or low-risk automation where one user
  operates the Workspace. The approval comment is still explicit evidence and
  Gate still verifies the request, digest, approver authorization, dispatcher
  actor, and batch definition.
- `AUTO_APPROVE`: Workspace policy choice for lightweight operation. Manual
  execution request creation also records explicit approval evidence
  automatically. Gate allows that evidence only when the merged Workspace policy
  is `AUTO_APPROVE`. The dispatcher still performs `workflow_dispatch`; the
  browser UI must not dispatch governed workflows directly.

Changing the approval mode from Workspace creates a pull request. The mode is
active only after that pull request is merged.

Relaxed modes reduce separation of duties; they do not remove evidence. Request
payload, approval source, dispatcher state, Gate decision, and workflow run
correlation must remain auditable.

## Register A Batch

Go to Batches and choose `Register batch`.

Required operator decisions:

- Batch ID
- name, owner, domain, environment, and criticality
- runner label such as `ubuntu-latest`, `self-hosted`, or custom labels
- Batch command
- optional execution file
- optional schedules

Registration creates a pull request with:

```text
.batch-governance/batches/{batchId}.yml
.github/workflows/{batchId}.yml
.batch-governance/batches/{batchId}/artifacts/{fileName}
```

The generated workflow path is derived from the Batch ID. Gate is mandatory and
the batch job depends on the Gate job.

Approve and merge the registration PR from the approvals inbox. After merge,
refresh Batches; the batch is read from the target repository.

## Request Execution

Manual execution starts from an active registered batch.

1. Choose `Request run`.
2. Review the batch context, workflow, runner, command, and request reason.
3. Create the execution request.

The UI creates a GitHub Issue containing:

- execution request marker
- canonical request payload
- SHA-256 request digest
- batch, workflow, runner, command, and requester context

After Issue creation, the UI routes to the approvals inbox. GitHub list APIs can
lag briefly, so the UI uses the returned Issue as immediate handoff evidence
until GitHub list results catch up.

## Approve Execution

An approver opens the execution request detail and verifies:

- Batch ID and request ID
- requester and expiration
- reason
- workflow path and ref
- runner label
- Batch command
- request digest

Approve writes a marker-backed Issue comment that starts with:

```text
/bgcp approve requestDigest=sha256:...
```

Reject requires a reason and records rejection evidence. Rejected, expired,
dispatched, dispatch-failed, Gate-blocked, and business-failed requests are no
longer approval work.

## Dispatch And Gate

The installed dispatcher workflow listens to `issue_comment.created`, but the
job runs only for actionable approval evidence on execution request Issues.

Dispatcher checks include:

- Issue is an execution request Issue.
- Approval comment is marker-backed and approved.
- request ID, Batch ID, digest, workflow path, and ref match.
- request is still actionable.
- no dispatching or dispatched evidence already exists for the request.

Only after those checks does dispatcher call `workflow_dispatch` for the target
workflow.

The target workflow runs `batchplane-gate` before the batch job. Gate verifies:

- request evidence exists
- approval evidence exists
- request and approval digest match
- dispatcher actor initiated the workflow
- direct UI reruns are not being used as a new authorization
- repository role mapping and Workspace self-approval policy allow the approval

If Gate passes, the `run-batch` job executes the Batch command. If Gate fails,
the Batch command does not run.

## Gate Blocked Behavior

A Gate block is a control failure, not a business failure. Operators should
inspect execution run detail and native GitHub Actions logs.

Common causes:

- missing `.batch-governance/policies/role-mapping.yml`
- missing or stale dispatcher workflow
- direct `workflow_dispatch` without a matching approved request
- GitHub Actions UI rerun of a previous governed workflow run
- self-approval while Workspace policy is `SELF_APPROVAL_BLOCKED`
- expired request
- digest mismatch after Issue body or approval evidence was edited
- token or `GITHUB_TOKEN` permissions cannot read required Issue evidence

The execution run list and run detail should distinguish Gate blocked runs from
business failures. Business failures occur only after Gate allowed execution and
the downstream Batch command failed.

## Schedule Notes

Schedules are stored inside the owning batch definition and approved through
the registration or change PR.

GitHub Actions cron entries are generated in UTC. BatchPlane keeps the
user-entered cron and timezone in batch metadata for audit and occurrence
validation, but GitHub itself triggers scheduled workflows using UTC cron.

Scheduled occurrences create or reuse occurrence-specific execution request
evidence and then dispatch through the same Gate-protected workflow path.
Scheduled occurrences do not wait in the manual approvals inbox.

## Security Limitations

BatchPlane Lite deliberately avoids a BatchPlane server. That makes setup
simple, but it also means these limitations are part of the design:

- GitHub repository permissions, branch protection, PR review, Issues, and
  Actions are the trust boundary.
- If a user can push directly to the default branch, they can bypass the
  intended pull-request control process. Protect the default branch.
- The browser UI cannot prevent someone with sufficient GitHub permission from
  attempting direct `workflow_dispatch`; Gate is the enforcement point.
- The browser token is available to the running page. Use trusted builds and
  least-privilege fine-grained tokens.
- Lite has no server-side secret vault. Do not write sensitive parameter values
  to Issues, pull requests, YAML, or logs.
- Job logs are fetched on demand and treated as transient operator evidence.
  They may contain large text or masked secrets from GitHub Actions.
- GitHub API and Actions visibility may lag. Immediate UI handoff evidence
  handles request creation, but repository list results and workflow run
  visibility can still appear later.
- Generated action references currently follow the BatchPlane action repository
  reference configured by this project. Organizations that require immutable
  action pinning should introduce a controlled workflow-template policy before
  production use.

## Verification Checklist

- Workspace connection succeeds.
- Installation status shows all required files present.
- Workflow drift status is up to date.
- Batch registration PR contains a batch definition and generated workflow.
- Registration approval merges the PR and the batch appears after refresh.
- Execution request creates an Issue and routes to approvals.
- Approval writes marker-backed Issue evidence.
- Dispatcher writes dispatching and dispatched evidence.
- Target workflow run appears in GitHub Actions.
- Gate job runs before the Batch command.
- Execution run detail separates Gate evidence, business job evidence, and logs.
