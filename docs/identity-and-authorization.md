# BatchPlane Identity And Authorization

Status: Architecture baseline for issue #191

## Principle

Identity providers authenticate users and services. BatchPlane owns product
roles, Workspace membership, policy evaluation, separation of duties, and the
authorization result.

AD, LDAP, OIDC, GitHub organizations, repository roles, and Jenkins authorities
are external identity facts. They do not become hard-coded product roles.

## Principal Model

```text
Principal
  principalId
  principalType: USER | SERVICE | AUTOMATION | PLATFORM
  status
  displayName
  externalIdentities[]

ExternalIdentity
  providerKey
  issuer
  subject
  username
  attributes
  lastVerifiedAt
```

One Principal may have multiple external identities. Historical audit records
refer to `principalId` and preserve the external subject used for the action.

## Identity Provider Port

An identity adapter normalizes:

- issuer and stable subject
- login/display attributes
- verified email when policy allows its use
- external groups, teams, or roles
- authentication time and assurance context
- service or platform identity claims

Main initially supports an OIDC adapter as the recommended interactive login
path. AD/LDAP group lookup and GitHub identity are provider adapters behind the
same port. Exact deployment priority is configurable.

## Workspace Roles

Initial internal roles are:

| Role                | Core permissions                                              |
| ------------------- | ------------------------------------------------------------- |
| `WORKSPACE_MANAGER` | Manage connections, policies, role mappings, follow-up review |
| `BATCH_MANAGER`     | Propose and inspect governed Batch changes                    |
| `REQUESTER`         | Create execution and change requests                          |
| `APPROVER`          | Decide requests allowed by policy                             |
| `OPERATOR`          | Execute, cancel, retry, inspect runs and logs as allowed      |
| `FAILURE_OWNER`     | Submit failure explanation and action                         |
| `AUDITOR`           | Read audit and evidence without operational mutation          |

Roles are Workspace-scoped. System administration is a separate deployment
role and does not automatically grant approval authority inside every
Workspace.

## Role Bindings

```text
RoleBinding
  roleBindingId
  workspaceId
  internalRole
  subjectSelector
  effectiveFrom
  effectiveUntil
  status
```

Subject selectors may target:

- an internal Principal
- an external user subject
- an external group/team subject
- a service identity
- a provider-native role mapped by an edition adapter

Main stores role bindings in MySQL. Lite maps GitHub users, teams, and
repository permissions to equivalent internal Lite roles through repository
configuration and verified API responses.

## Approval Policy

```text
ApprovalPolicyRevision
  policyRevisionId
  workspaceId
  subjectTypes[]
  conditions
  requirements[]
  separationRules[]
  effectiveFrom
  effectiveUntil
  canonicalDigest
```

A requirement identifies an internal role and count. Conditions may inspect
operation type, environment, criticality, provider, Batch label, trigger type,
or risk classification.

Separation rules include:

- requester and approver must differ
- change author and final approver must differ
- failure submitter and manager reviewer must differ
- a service that applies a change cannot be represented as the human approver

Every approval decision records the policy revision and effective role evidence
used at decision time.

## Approval Modes

The existing Workspace modes remain supported as policy presets:

- `SELF_APPROVAL_BLOCKED`: separation of requester and approver is required.
- `SELF_APPROVAL_ALLOWED`: the same Principal may request and approve where the
  policy permits it; evidence records self-approval.
- `AUTO_APPROVE`: eligible request types may be authorized by a Workspace policy
  automation Principal; evidence records the policy source.

These presets do not replace detailed Approval Policy revisions. Main may
expose them as templates. Lite may continue using the compact Workspace policy
file.

`AUTO_APPROVE` includes self-approval permission for manually approvable work,
but scheduled execution does not depend on this mode. An approved Schedule
Revision is its own authority source.

Policy, role-binding, credential, and installation changes are authorized by
the policy revision effective before the proposed mutation. Proposed policy
content cannot authorize its own activation. A deployment may require stronger
fixed separation rules for these security-administration subjects even when the
general Workspace preset is `AUTO_APPROVE`.

## Authorization Boundaries

Authorization is checked at:

- every command API
- every Workspace-scoped query
- provider credential use
- native log access
- approval decision creation
- Gate start and completion authentication
- audit export
- policy and role-binding mutation
- failure manager review

UI visibility is not an authorization control. Server queries and commands
must enforce Workspace and action scope independently.

## Service And Automation Identities

The following must have separate Principals:

- Main outbox worker
- provider reconciliation worker
- GitHub App installation
- GitHub Actions Gate connector
- Lite dispatcher automation
- Jenkins Plugin installation
- notification adapter

Audit records must distinguish the human who authorized work from the service
that dispatched or applied it.

## Session And Credential Rules

### Main

- Interactive sessions use secure server-issued sessions or validated OIDC
  access tokens.
- Provider credentials are server-side only.
- Browser storage does not contain GitHub App private keys, Jenkins tokens, or
  reusable Gate service credentials.
- Connector credentials are rotatable without changing Batch identities.

### Lite

- GitHub token remains in `sessionStorage` only.
- The UI documents that browser compromise can expose the current session.
- Repository permissions are re-read for sensitive decisions.
- Browser-local state cannot weaken repository-backed approval policy.

## Denial And Audit

Authorization denial uses stable reason codes and records:

- Principal and external identity
- Workspace and requested action
- subject and provider context
- applicable policy revision
- denial reason
- occurred time and correlation ID

Sensitive token values and full identity assertions are never recorded in the
audit payload.

## Open Deployment Decisions

Before a production Main release, deployment owners must decide:

- primary interactive IdP and required assurance level
- AD/LDAP synchronization versus on-demand lookup
- system-administrator scope and emergency access process
- session lifetime and reauthentication for sensitive actions
- secret-manager implementation
- group-membership refresh and revocation timing

These values are deployment policy, not assumptions embedded in the core
domain.
