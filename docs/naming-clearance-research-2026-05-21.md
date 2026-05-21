# Naming Clearance Research - 2026-05-21

Status: P0 incident response  
Scope: project/product name replacement for the current BatchTrail repository  
Decision state: BatchTrail must be abandoned before further brand-reinforcing merges

This is not a legal opinion or formal trademark clearance. It is an engineering/product
knockout search intended to prevent obvious name collisions before the project is renamed.
Before public launch, a trademark professional should still review the selected name.

## Why BatchTrail Is Rejected

`BatchTrail` has an active external product/service presence at `https://batchtrail.com/`.

Observed evidence:

- `https://batchtrail.com/` serves an active product page with title `Batchtrail`.
- The page description positions Batchtrail as an operational platform for recipes,
  inventory, batch production, quality control, traceability, and AI-driven insights.
- Verisign RDAP shows `BATCHTRAIL.COM` registered on `2026-04-24`.
- The semantic overlap is material enough: both products use batch + traceability/audit
  language, even though our target domain is IT batch control.

Result: reject permanently.

## Knockout Criteria

Reject or avoid a candidate when any of these are true:

- Exact active product/service exists.
- Exact `.com` domain is registered by another party and appears product-like.
- Exact npm/PyPI package already exists for the expected package spelling.
- Exact GitHub user/org/repo presence is strong enough to cause open-source confusion.
- Search results show meaningful software, audit, batch, workflow, control, or
  traceability adjacency.
- The name over-anchors GitHub Lite and makes the future installed/Jenkins/SCDF version
  feel secondary.

## Candidate Results

| Candidate     | Status                        | Evidence                                                                                                                                                                                                          | Product Fit                                                                          |
| ------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| BatchTrail    | Reject                        | Active `batchtrail.com`; RDAP registered `2026-04-24`; strong semantic overlap.                                                                                                                                   | Previously good, now unusable.                                                       |
| BatchTrace    | Reject                        | `.com` taken; GitHub user exists; traceability domain overlap is high.                                                                                                                                            | Too close to BatchTrail and traceability products.                                   |
| BatchTrack    | Reject                        | `.com` taken; many GitHub name hits.                                                                                                                                                                              | Too generic and noisy.                                                               |
| BatchLedger   | Avoid                         | `.com` taken; ledger wording is audit-friendly but generic.                                                                                                                                                       | Good meaning, weak distinctiveness.                                                  |
| BatchProof    | Reject                        | `.com` taken; exact product/domain risk.                                                                                                                                                                          | Good meaning, not clean enough.                                                      |
| BatchGate     | Avoid                         | `.com` appears unregistered, but the name is generic and collides semantically with payment/security gateway language.                                                                                            | Clear, but too broad and risky.                                                      |
| BatchGuard    | Reject                        | `.com` taken; GitHub user exists; generic security/tooling feel.                                                                                                                                                  | Understandable, but noisy.                                                           |
| BatchWarden   | Hold                          | `.com` appears unregistered; npm/PyPI free; GitHub has exact-name repositories for unrelated tooling.                                                                                                             | Distinct enough, but tone may feel harsh.                                            |
| BatchPatrol   | Backup                        | `.com` appears unregistered; npm/PyPI free; no meaningful GitHub exact hits found.                                                                                                                                | Clear control/monitoring meaning, but less audit/evidence-oriented.                  |
| BatchSeal     | Recommended                   | `.com` appears unregistered; npm/PyPI free for `batchseal` and `batch-seal`; GitHub exact repo search found no direct project collision; search noise is generic manufacturing/food text, not a software product. | Strong audit/control metaphor: an approved run is sealed by evidence.                |
| GitBatchGate  | Backup for Lite branding only | `.com` appears unregistered; npm/PyPI free; no GitHub exact hits found.                                                                                                                                           | Very clear for GitHub Lite, but too Git-specific for the installed adapter platform. |
| RepoRunGate   | Backup                        | `.com` appears unregistered; npm/PyPI free; no GitHub exact hits found.                                                                                                                                           | Communicates repo-triggered execution; weaker batch/audit meaning.                   |
| BatchRepoGate | Backup                        | `.com` appears unregistered; npm/PyPI free; no GitHub exact hits found.                                                                                                                                           | Descriptive, but long and mechanical.                                                |

## Recommended Direction

Use one umbrella project name and edition names:

- Project: `BatchSeal`
- GitHub Pages edition: `BatchSeal Lite`
- Future server edition: `BatchSeal Server`

Reasoning:

- It keeps `Batch` in the name, so the target domain stays obvious.
- `Seal` fits approval, audit evidence, tamper-awareness, and execution authorization.
- It does not overfit to GitHub, so Jenkins/SCDF adapters still feel native later.
- The name is simpler and less obscure than prior candidates like `Ordo` or `Oath`.
- Current knockout checks are cleaner than the other understandable candidates.

## Brand Notes If BatchSeal Is Chosen

Suggested short positioning:

> BatchSeal is an open-source batch control system that seals every batch change and
> execution with approval evidence.

Suggested Korean positioning:

> BatchSeal은 배치 등록, 변경, 실행을 승인 증적과 함께 봉인하는 오픈소스 배치통제 시스템입니다.

Logo/color direction:

- Primary motif: batch run line + approval seal/check mark.
- Lite variant: small repo/branch marker added to the same seal motif.
- Server variant: same seal motif with adapter/node marker.
- Suggested palette: deep navy for trust, green for approval, amber for pending,
  red for blocked/failure. Avoid a one-note blue/purple palette.

## Required Rename Work After Name Selection

If `BatchSeal` is accepted, do the rename as one P0 migration PR:

- Repository description, README, docs, SRS, technical specs.
- Package scopes, package names, npm workspace names.
- GitHub Action paths and action display names.
- UI copy, i18n keys/values, logos, color tokens.
- Workflow templates, dispatcher/gate messages, issue labels/comments.
- Open issues and PR references where feasible.
- GitHub Pages deployment base/title metadata.

## Queries Performed

Infrastructure/package checks:

- Verisign RDAP `.com` checks for rejected and candidate names.
- npm registry exact checks for compact and hyphenated package forms.
- PyPI exact checks for compact and hyphenated package forms.
- GitHub user/repo exact and name search checks for shortlisted candidates.

Web checks:

- Exact-name searches for `BatchTrail`, `BatchSeal`, `BatchPatrol`, `BatchWarden`,
  `BatchGate`, `GitBatchGate`, `RepoRunGate`, and `BatchRepoGate`.

Current recommendation confidence: medium-high for knockout purposes, not legal clearance.
