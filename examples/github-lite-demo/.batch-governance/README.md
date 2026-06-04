# BatchPlane Governance

This directory stores BatchPlane Lite definitions and audit evidence that are
reviewed through GitHub pull requests and issues.

- `batches/`: approved batch definitions and optional execution artifacts
- `workspace.yml`: Workspace-level approval mode. Default is
  `SELF_APPROVAL_BLOCKED`; use `SELF_APPROVAL_ALLOWED` only when the repository
  intentionally permits requester approval.
- `policies/role-mapping.yml`: repository-side approver role mapping used by
  Gate when self-approval is not explicitly allowed.
- `.github/workflows/batchplane-sample-target.yml`: sample governed target
  workflow

Do not edit governed batch definitions directly in production use. Use
BatchPlane registration, change, and deletion request flows so Pull Requests and
approval evidence remain auditable.
