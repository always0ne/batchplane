# Unified Request Feature Specification

## Status And Delivery Boundary

Deferred feature definition, recorded on 2026-09-20. The product direction below
is approved; detailed UX, processing rules, contracts and implementation are
not approved or implementation-ready. Revisit them after the refactoring is
complete. This is not part of R7 or a prerequisite for accepting its cleanup.

The current change-request and execution-request flows remain independent.
Their creation/detail URLs, query modes, approval rules, evidence and commands
are preserved during the sitemap refactoring. The existing Workspace request
list is not evidence that unified requests have been implemented.

## Agreed Requirements

| ID    | Requirement                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| UR-01 | A request is a product-level work document that can contain items for multiple Batches.                                                     |
| UR-02 | Registration, change, deletion and execution are item types; different types can appear in the same request.                                |
| UR-03 | Approve or reject the entire request, not individual items.                                                                                 |
| UR-04 | Distinguish the request's approval state from the processing outcome of each item.                                                          |
| UR-05 | Provide a dedicated request-writing Page rather than treating the entire document as a single operation selected by a query parameter.      |
| UR-06 | Lite and Main share product UI semantics. GitHub Issue/PR representations are adapter responsibilities, not the request's product identity. |

For example, one request may ask to change Batch A, register Batch B and execute
Batch C. An approval covers that submitted request as a whole. This example does
not define execution order, atomic application, rollback or failure recovery.

## Target Screens And Routes

| Screen          | Target route           | Boundary                                                           |
| --------------- | ---------------------- | ------------------------------------------------------------------ |
| Request list    | `/requests`            | Existing list; adapt to the unified model during this feature.     |
| Request writing | `/requests/new`        | Future dedicated Page, displayed as Request writing / 요청서 작성. |
| Request detail  | `/requests/:requestId` | Future product request detail, approval and item outcomes.         |

`new` is the agreed writing-route segment. Earlier proposals using `compose` or
`create` are superseded. These two new request routes are not registered by the
current refactoring. Component filenames and a complete screen layout remain
part of the later feature design.

The writing Page must represent a request containing items, rather than a
whole-document registration/change/deletion/execution mode. Detailed fields,
item editing, validation messages, review presentation and navigation journeys
will be specified together before implementation.

## Decisions To Make After Refactoring

- Which combinations of operations on the same Batch are allowed, and how any
  dependencies between items are presented and processed.
- How item ordering, partial success and failures affect the overall request.
  Whole-request approval does not imply a cross-platform atomic transaction.
- How the approved request content and item revisions bind to later processing,
  and how any permitted correction or resubmission obtains approval again.
- How Lite associates the unified product request with Issue and PR evidence,
  without weakening the current registration or execution controls.
- Product/client contracts and the Main persistence model needed for the
  approved behavior, rather than speculative extension points.
- Whether drafts or temporary saving are needed. Neither is authorized by the
  writing-route decision.
- Complete journeys from Batch/request lists through writing, approval, item
  outcomes, execution detail and audit, including English and Korean UI.

This list records questions, not defaults or implementation tasks. Do not add a
draft store, generic request engine, new adapter API, automatic retry, rollback
or new approval policy while completing the refactoring.

## References And Current Contracts

- [Current GitHub Lite SRS](./github-lite-srs.md)
- [Current technical contracts](./github-lite-technical-spec.md)
- [Frontend ownership and routing rules](./frontend-engineering-principles.md)
- [Connected UI/UX baseline](./lite-ui-ux-baseline.md)
- [ServiceNow request and requested-item workflows](https://www.servicenow.com/docs/r/servicenow-platform/service-catalog/t_CreateANewServiceCatalogWorkflow.html)
  are a reference for parent-request/item separation, not a claim that their
  approval policy matches UR-03.
- [React Router 6.30.3 routing](https://reactrouter.com/6.30.3/route/route)
  describes the library's route composition. It does not prescribe our business
  model, directory names or one mandatory writing-route segment.
