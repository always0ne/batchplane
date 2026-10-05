# BatchPlane Product Scope And Editions

Status: Product direction and delivery scope reconciled 2026-10-05.
See the [approved roadmap](./control-plane-migration-plan.md) for implementation
order and [traceability](./requirements-traceability.md) for readiness.

## Product Definition

BatchPlane is a unified batch control and audit platform. Integration of multiple
batch engines is its central purpose. Approval, mandatory Gate enforcement,
internal authorization, operational history and failure review are also P0
requirements, not optional extras.

Native platforms own scheduling, runners and execution. BatchPlane owns common
requests, approvals, authorization, controlled changes, execution admission,
correlation, operating queries and audit. GitHub Actions is first, Jenkins next,
and a third platform will be selected and actually validated. SCDF was an
example, not the committed third provider.

## Editions And Current Availability

| Concern                | Lite baseline                                                                                               | Main target                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Runtime                | React/Vite static UI plus GitHub APIs and Actions; no product server/DB                                     | Kotlin/Spring Boot modular monolith and MySQL                              |
| UI                     | Existing shared React product Pages                                                                         | Same source with a Main client implementation, not a second UI             |
| Authority              | Repository definitions, PRs, Issues/comments and native execution evidence                                  | Product state, decisions and audit in MySQL                                |
| Identity               | Session-scoped GitHub identity mapped to product roles                                                      | Environment-specific identity adapters; product-owned authorization        |
| Connections            | Currently one connected repository-backed Workspace                                                         | Multiple Workspaces, multiple platform connections per Workspace           |
| Change / execution     | Implemented core flow, with known gaps and pending QA                                                       | Planned complete vertical flows                                            |
| Schedule               | Native same-execution control/business/result implementation; live #202 still open                          | Approved-revision authority, native scheduler and delay monitoring         |
| Approved input binding | End-to-end correction pending #212                                                                          | Required in first manual execution flow                                    |
| Lifecycle              | Termination correction #224 and approved withdrawal/real cancel #225 pending                                | Required in first flow; result synchronization is a separate command       |
| Multi-Workspace        | #142: aggregate authorized queries and unified requests, Lite-first subject to agreed feasibility gate      | Required product scope, not just switching                                 |
| History / review       | Execution logs, deleted history, explanation and explicit manager review present; completeness #226 pending | Required across supported operations                                       |
| Supported engines      | GitHub Actions                                                                                              | GitHub Actions, early real Jenkins, then broader/third-platform validation |

“Present” means code exists, not that manual or live acceptance passed.
Read the [user QA sheet](./user-qa.ko.md) before claiming operating readiness.

## Shared Product Semantics

A Workspace is an access and policy boundary; a platform connection identifies
a configured engine installation or endpoint within it. They are not synonyms.
A Batch has product identity and a provider-specific external reference.

A Change Request authorizes a precise proposed revision. A manual execution
request authorizes its precise target and inputs. A native scheduled occurrence
uses the approved owning Batch/schedule revision without a new human approval.

One unified request may contain several Batches, operation types and Workspaces.
A common approver authorized for every target is required before creation; one
common approver approves the whole request. Repository-backed trust boundaries
do not disappear when the UI aggregates them. The Lite cross-repository evidence
and credential design still requires #142 approval; difficulty does not authorize
silently reducing the agreed user flow.

Approval, dispatch acceptance, Gate admission and business completion are
different facts. Confirmed dispatch failure requires a new request, not reuse of
the old approval. Withdrawal and real cancellation depend on native execution
state. Result synchronization updates observations without starting or stopping
execution.

## Audit Limits

Main targets append-only decisions through supported APIs, backed by deployment
access and retention controls. Lite writes structured GitHub evidence, whose
contents remain subject to GitHub permissions, edits, deletion and retention.
Neither a digest nor an Issue label is an authorization credential or an
immutable audit store. Deleted Batches retain their accessible historical
revision and execution links; missing native evidence must be identified.

## Delivery And Non-Goals

P0 does not mean every provider ships in one release. Each provider's supported
scope must be explicit; a successful dispatch alone does not establish full
control. Jenkins's early first-flow proof is separate from full support.

The source repository remains a [modular monorepo](./adr/0001-modular-monorepo.md)
with separate runtime artifacts. No new engine, speculative plugin loader,
second UI, compatibility framework, automatic retry or backfill is approved.

Older proposals for discovery/onboarding, export, external notifications and
recurrence reports are preserved for scope confirmation, not deleted or treated
as newly approved implementation. Exact Main contracts and provider integration
details are designed at their roadmap stage.
