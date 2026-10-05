# Identity And Authorization

[한국어](./identity-and-authorization.ko.md)

Status: Product rules accepted; Main model details require #227.
Reconciled 2026-10-05.

## Ownership

Identity adapters authenticate users/services and provide external facts.
BatchPlane owns product identity mapping, Workspace membership, authorization,
approval policy and audit. AD/LDAP/OIDC/GitHub groups and repository permissions
are facts to map, not hard-coded product permission definitions.

No Main identity provider, session protocol or complete role list has been
selected by this document. OIDC, AD/LDAP and GitHub are candidates according to
deployment needs.

## Basic Model To Approve Before Main Code

#227 must define:

- Stable internal account identity and its external authentication identities.
- Workspace membership and permission scope, separate from platform connection.
- Human, automation and platform actors and their recorded authorization source.
- Request, execution, approval, management, follow-up review and audit permissions.
- Which operation can target which Batches/connections/Workspaces.
- Revocation/current-policy behavior and historical role evidence.
- Unified-request all-target authority and actual cancellation permission mapping.
- Concrete API/MySQL representation after these concepts are approved.

A connection may be one of several platforms inside a Workspace. A login session
is not a Workspace. Do not let global administration silently imply approval of
every Workspace's work.

## Approved Request Rules

Default self-approval is blocked. Explicit Workspace modes:

| Mode                    | Meaning                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `SELF_APPROVAL_BLOCKED` | Requester cannot approve their own request.                                                                  |
| `SELF_APPROVAL_ALLOWED` | An otherwise eligible approver may self-approve; evidence identifies this.                                   |
| `AUTO_APPROVE`          | Eligible request types receive policy-based approval evidence; also includes permitted manual self-approval. |

These modes do not grant an unqualified user an approver role. UI capability,
actual command and Gate must agree; Lite consistency and complete approved
revision lookup are #223.

Eligible Batch changes and manual execution use the current policy. Proposed
policy/role/installation changes do not authorize themselves using proposed
values. Preserve decision actor, subject digest, policy context and reason.
Rejection requires a reason; modifying the approved content invalidates it.

Native schedules use an approved owning Batch revision in every mode. They do
not wait for per-occurrence human approval or fabricate an automatic approver.

Failure explanation requires explicit authorized manager review with its own
decision/reason. A self-approval-enabled policy may permit an eligible manager
to review their own submission; AUTO_APPROVE does not silently close the case.

## Unified Requests

One request may include several Batches, operation types and Workspaces.
Creation requires at least one common approver with authority for **every**
included operation. One common approver approves the whole request. Do not
replace this with collecting independent Workspace approvals.

The request creator must have permission for each target operation, and
aggregate reads expose only authorized scope. Cross-repository evidence storage
in Lite and multi-target Main contracts are designed in #142/#227. No hidden
shared repository token or new central authority is assumed.

## Withdrawal, Cancel And Result Synchronization

Before delivery, approved work can be withdrawn by the requester, its actual
approver or a user authorized to execute the target. Recheck at command/delivery/
Gate boundaries; a hidden button is not a control.

When queued or running, use explicit real cancel/stop confirmation with a reason.
Detailed mapping from product roles to cancel authority requires #225/#227
approval. Cancellation records requested and actual outcome. Unknown state is
not completion, and cancellation is not rollback of already-performed effects.

Result synchronization is a separate observation repair. It must never grant
permission to dispatch, retry or cancel.

## Edition Trust Boundaries

Lite currently uses a repository-backed Workspace, sessionStorage-only GitHub
token and repository evidence/verified API facts. Browser compromise can expose
the current token; local state cannot weaken effective approval policy.

Main keeps provider secrets server-side or behind a credential-storage adapter.
The browser does not receive reusable engine/connector secrets. Authentication
of platform callbacks and Gate identity must bind actual connection/native
identity; accepting an ID in JSON does not establish authenticity.

Supported product APIs preserve audit evidence, but GitHub editors and database
administrators remain infrastructure trust boundaries. Historical evidence and
current permissions are distinct; do not infer present permission from an old
comment alone.

## Checks And Evidence

Enforce authority on queries, mutation, approvals, provider commands, logs,
review and Gate, not only in React. Record safe actor/subject/context/reason
without tokens or raw identity assertions. Verify both allowed and denied
paths through the [QA sheet](./user-qa.md); no new identity framework or
speculative permission hierarchy is approved here.
