# Naming Clearance Research - 2026-05-21

Status: P0 incident response  
Scope: replacement naming pool for the current BatchTrail repository  
Decision state: BatchTrail is rejected; replacement name is not selected yet

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
- The name is too obscure for the target buyer/user to remember without explanation.

## Current Search Method

Second-pass candidate generation expanded from the earlier small shortlist.

- Generated 218 candidates across `Batch`, `Run`, `Job`, `Repo`, `Git`, `Ops`, `Flow`,
  and `Task` naming families.
- Checked exact `.com` RDAP status through Verisign for compact lowercase forms.
- Checked exact npm registry availability for compact and hyphenated package forms.
- Checked exact PyPI availability for compact and hyphenated package forms.
- Performed web searches for representative high-fit candidates and known risk terms.

Important limitation:

- `.com` RDAP `404` means no Verisign registration was returned at check time. It is not
  a purchase guarantee and does not replace registrar checkout.
- npm/PyPI availability is point-in-time.
- Search engine results are a knockout aid, not legal clearance.

## Rejected Or Deprioritized

| Candidate   | Status         | Reason                                                                |
| ----------- | -------------- | --------------------------------------------------------------------- |
| BatchTrail  | Reject         | Active external service at `batchtrail.com`; strong semantic overlap. |
| BatchTrace  | Reject         | `.com` taken; traceability adjacency is too close.                    |
| BatchTrack  | Reject         | `.com` taken; noisy GitHub/search results.                            |
| BatchProof  | Reject         | `.com` taken.                                                         |
| BatchGuard  | Reject         | `.com` taken; generic security/tooling wording.                       |
| BatchDocket | Deprioritize   | Search results include an existing R package function `batchDocket`.  |
| BatchMinder | Deprioritize   | Search results include exact `Batchminder` game/card usage.           |
| RunVouch    | Deprioritize   | Search results include active `RUNVOUCH LTD`.                         |
| BatchSeal   | Owner-rejected | Availability looked usable, but the project owner does not prefer it. |

## Exact Search Result Hygiene

After the automated `.com + npm + PyPI` pass, the stronger candidates were checked with
quoted exact-name web searches. This is the practical "what happens when someone Googles
the name" filter.

### Search-Clean Candidates

These had no meaningful exact-name search results in the checked pass. They should still
get a final manual Google check before selection, but they are currently cleaner than the
rest of the pool.

| Candidate           | Current search hygiene | Product note                                      |
| ------------------- | ---------------------- | ------------------------------------------------- |
| BatchWarrant        | Clean                  | Strong execution authorization meaning.           |
| BatchSignoff        | Clean                  | Familiar enterprise approval wording.             |
| BatchQuorum         | Clean                  | Fits maintainer/multi-approver policy well.       |
| BatchPolicyGate     | Clean                  | Very explicit policy-before-run meaning.          |
| BatchRulebook       | Clean                  | Good policy-as-code/repo governance meaning.      |
| BatchControlHub     | Clean                  | Direct match for financial batch-control wording. |
| BatchControlKit     | Clean                  | Open-source toolkit feel.                         |
| BatchControlPlane   | Clean                  | Strong platform/adapter architecture wording.     |
| BatchExecutionGuard | Clean                  | Very clear, but long.                             |
| BatchNotary         | Clean                  | Approval/evidence metaphor is strong.             |
| BatchCustody        | Clean                  | Good for audit trail and evidence custody.        |
| BatchSteward        | Clean                  | Governance/ownership feel.                        |
| BatchCouncil        | Clean                  | Approver group feel.                              |
| BatchCharter        | Clean                  | Governance/policy feel.                           |
| BatchAegis          | Clean                  | Protective, but may need explanation.             |
| RepoAttest          | Clean                  | Good GitHub Lite/repo evidence name.              |
| RepoWarrant         | Clean                  | Good GitHub Lite/repo execution authority name.   |
| RepoAuditGate       | Clean                  | Good component name for Lite.                     |
| OpsDocket           | Clean                  | Good request/inbox/audit workflow meaning.        |
| OpsSignoff          | Clean                  | Broader installed-platform approval feel.         |
| FlowAuditGate       | Clean                  | Works across workflow engines.                    |
| FlowPolicyGate      | Clean                  | Workflow-engine neutral policy gate.              |

### Search-Noisy Candidates

These should be rejected or lowered unless the project owner strongly prefers the name.

| Candidate       | Search issue                                                                    |
| --------------- | ------------------------------------------------------------------------------- |
| BatchPermit     | Exact results appear in crypto Permit2/code and industrial controller docs.     |
| BatchApproval   | Exact `BatchApproval` plugin appears in PowerCMS X and other workflow contexts. |
| BatchAttest     | Exact `batchAttest` appears in attestation/blockchain API documentation.        |
| BatchWitness    | Exact `BatchWitness` appears in Rust/proof-related crate docs.                  |
| BatchEvidence   | Exact string appears in public payment/register documents.                      |
| BatchClearance  | Exact `batchclearance` appears as a logistics/customs term.                     |
| BatchCheckpoint | Exact `BatchCheckpoint` appears in batch-processing/checkpointing code.         |
| BatchGrant      | Exact `BatchGrantPermissions` appears in Alibaba Cloud API documentation.       |
| BatchAnchor     | Exact `batchAnchor` appears in code/search snippets.                            |
| GitSignoff      | Exact `gitSignOff` is an established Renovate preset/config term.               |
| RepoPermit      | Exact string appears in public permit documents.                                |
| OpsWarrant      | Exact string appears in public agenda/warrant-register documents.               |
| OpsAttest       | Exact-like lowercase `opsattest` appears in unrelated language/dictionary hits. |

## BatchControlHub Refinement Pass

The owner asked to refine the `BatchControlHub` direction because it maps directly to
the Korean financial-domain term "배치통제". This pass expands around that root and
checks whether a nearby name is cleaner.

### Findings

- `BatchControlHub` exact-name search is currently clean.
- `batchcontrolhub.com`, `.org`, `.io`, `.dev`, `.app`, `.net`, and `.co` returned no
  RDAP registration in the point-in-time checks.
- npm/PyPI exact checks for `batchcontrolhub` and `batch-control-hub` were clean.
- GitHub exact repository-name search returned no direct hits for `BatchControlHub`.
- The base `batchcontrol.com` is registered.
- `BATCHCONTROL PRO` appears as a 2026 trademark application for batching systems with
  computer hardware/software, so `BatchControl*` names have some industrial/manufacturing
  adjacency risk.
- `ControlHub` is an active procurement software brand and has trademark/search presence,
  so `*ControlHub` suffixes have additional component-word risk even when the full exact
  phrase is clean.

### Variant Comparison

| Candidate            | Exact search hygiene | Availability hygiene           | Product fit                                            | Risk note                                                 |
| -------------------- | -------------------- | ------------------------------ | ------------------------------------------------------ | --------------------------------------------------------- |
| BatchControlHub      | Clean                | `.com/.org/.io/.dev` clean     | Best direct match for 금융권 "배치통제"; product-like. | Contains both `BatchControl` and `ControlHub` components. |
| BatchControlPlane    | Clean                | `.com/.org/.io/.dev` clean     | Strong architecture/platform meaning for adapters.     | More infra-heavy; less friendly as a public brand.        |
| BatchControlConsole  | Clean                | `.com/.org/.io/.dev` clean     | Good UI/admin surface meaning.                         | Sounds like one screen/tool, not whole platform.          |
| BatchControlBoard    | Clean                | `.com/.org/.io/.dev` clean     | Good approval board / work board feel.                 | Could feel task-board-like.                               |
| BatchControlDesk     | Clean                | `.com/.org/.io/.dev` clean     | Good operations desk feel.                             | Helpdesk/service-desk association.                        |
| BatchControlGate     | Clean                | `.com/.org/.io/.dev` clean     | Very clear execution-blocking meaning.                 | Better component name than umbrella product name.         |
| BatchControlAudit    | Clean                | `.com/.org/.io/.dev` clean     | Direct audit/control meaning.                          | Less complete than approval + execution + audit product.  |
| BatchControlLedger   | Clean                | `.com` clean in automated pass | Strong audit trail meaning.                            | Ledger has finance/blockchain associations.               |
| BatchControlRegistry | Clean                | `.com` clean in automated pass | Good for registered batch definitions.                 | More catalog than control.                                |
| BatchControlVault    | Clean                | `.com` clean in automated pass | Strong evidence retention/security meaning.            | Vault may imply secrets/storage.                          |
| BatchControlCore     | Clean                | `.com` clean in automated pass | Platform core feel.                                    | Generic and less market-facing.                           |
| BatchControlCenter   | Noisy                | `.com/.org/.io/.dev` clean     | Understandable.                                        | Search hit: Santander/F1rst `#BatchControlCenter`.        |
| BatchControlTower    | Noisy                | `.com/.org/.io/.dev` clean     | Operational command-center metaphor.                   | Search hit in industrial/concrete batch-control context.  |
| BatchControlPanel    | Noisy                | `.com/.org/.io/.dev` clean     | UI-oriented.                                           | Existing software class/UI snippets use this wording.     |
| BatchGovernanceHub   | Clean                | `.com/.org/.io/.dev` clean     | Avoids `BatchControl` root; governance-oriented.       | Less direct than "배치통제".                              |
| BatchPolicyHub       | Clean                | `.com/.org/.io/.dev` clean     | Policy-as-code / approval rules hub.                   | Weaker batch-control business wording.                    |
| BatchRunControl      | Clean                | `.com/.org/.io/.dev` clean     | Very execution-focused.                                | Less registration/change approval meaning.                |

### Refined Recommendation

If the priority is 금융권 사용자에게 즉시 이해되는 이름, keep `BatchControlHub` as the
lead candidate, with this brand structure:

- Product: `BatchControlHub`
- GitHub Pages edition: `BatchControlHub Lite`
- Future server edition: `BatchControlHub Server`
- Gate/action component: `BatchControlGate`
- UI/admin component wording: `BatchControlConsole`

If the priority is lower component-word conflict risk, move the lead candidate to
`BatchControlPlane` or `BatchGovernanceHub`:

- `BatchControlPlane`: technically strong and exact-search clean, but more infra-heavy.
- `BatchGovernanceHub`: cleaner from `BatchControl`/`ControlHub` component risk, but less
  direct for the financial "배치통제" phrase.

Current product judgment: `BatchControlHub` is the best meaning fit, but it should receive
formal legal review because `BatchControl` and `ControlHub` both have adjacent market or
trademark presence.

## Stronger Candidate Pool

These names passed the current `.com + npm + PyPI` knockout check and are still worth
human review. They are grouped by product meaning rather than final rank.

### Approval / Authorization

| Candidate      | Korean sense        | Fit                                                    | Concern                                     |
| -------------- | ------------------- | ------------------------------------------------------ | ------------------------------------------- |
| BatchPermit    | 배치 실행 허가      | Directly says a batch needs permission before running. | Slightly generic.                           |
| BatchWarrant   | 배치 실행 영장/권한 | Strong control meaning; execution is authorized.       | Legal nuance may feel heavy.                |
| BatchClearance | 배치 승인 통과      | Good for approval-before-run.                          | Long.                                       |
| BatchSignoff   | 배치 승인 서명      | Familiar enterprise approval word.                     | Less technical.                             |
| BatchApproval  | 배치 승인           | Very explicit.                                         | Generic.                                    |
| BatchGrant     | 배치 권한 부여      | Short and approval-oriented.                           | May sound access-control-only.              |
| RunWarrant     | 실행 권한           | Good for runtime authorization.                        | Less batch-specific.                        |
| RunSignoff     | 실행 승인           | Clear and direct.                                      | Less batch-specific.                        |
| RunApproval    | 실행 승인           | Explicit.                                              | Generic.                                    |
| RepoPermit     | 저장소 기반 허가    | Strong Lite fit.                                       | Future server edition may feel less native. |
| RepoWarrant    | 저장소 기반 실행권  | Strong Lite fit with control.                          | Legal nuance; repo-specific.                |
| GitSignoff     | Git 승인 서명       | Very Lite-oriented and understandable.                 | Too Git-specific for umbrella name.         |
| GitApproval    | Git 승인            | Direct Lite fit.                                       | Too Git-specific for umbrella name.         |
| OpsPermit      | 운영 실행 허가      | Broader than batch; good installed-platform feel.      | Less batch-specific.                        |
| OpsSignoff     | 운영 승인           | Enterprise-friendly.                                   | Less distinctive.                           |

### Audit / Evidence

| Candidate      | Korean sense       | Fit                                        | Concern                       |
| -------------- | ------------------ | ------------------------------------------ | ----------------------------- |
| BatchAttest    | 배치 증명/입증     | Audit-friendly; close to attestation.      | Slightly formal English.      |
| BatchWitness   | 배치 증인/증적     | Strong evidence metaphor.                  | May sound legalistic.         |
| BatchNotary    | 배치 공증          | Approval/evidence is very clear.           | Legal-office tone.            |
| BatchCustody   | 배치 증적 보관     | Good for audit trail and chain-of-custody. | May imply asset custody.      |
| BatchEvidence  | 배치 증적          | Extremely explicit.                        | Long and literal.             |
| BatchAuditHub  | 배치 감사 허브     | Direct for audit product.                  | Less elegant as brand.        |
| BatchAuditGate | 배치 감사 게이트   | Directly communicates gate + audit.        | Long and mechanical.          |
| RunAttest      | 실행 증명          | Good for Gate/action package naming.       | Less batch-specific.          |
| RunWitness     | 실행 증적          | Strong runtime evidence meaning.           | Less batch-specific.          |
| RunNotary      | 실행 공증          | Clear approval/evidence metaphor.          | Legal tone.                   |
| RunAuditGate   | 실행 감사 게이트   | Good for the GitHub Action/Gate component. | Component-like, not umbrella. |
| RepoAttest     | 저장소 기반 증명   | Strong GitHub Lite fit.                    | Repo-specific.                |
| RepoAuditGate  | 저장소 감사 게이트 | Good Lite component naming.                | Long.                         |
| OpsAttest      | 운영 증명          | Good installed-platform feel.              | Less batch-specific.          |
| FlowAuditGate  | 흐름 감사 게이트   | Works across workflow engines.             | More workflow than batch.     |

### Governance / Control

| Candidate           | Korean sense       | Fit                                                  | Concern                          |
| ------------------- | ------------------ | ---------------------------------------------------- | -------------------------------- |
| BatchGovern         | 배치 거버넌스      | Strong governance signal.                            | Verb form feels slightly odd.    |
| BatchPolicyGate     | 배치 정책 게이트   | Very clear: policy blocks execution.                 | Long, component-like.            |
| BatchRulebook       | 배치 규칙집        | Good for policy-as-code and repo mode.               | Less execution-focused.          |
| BatchControlHub     | 배치통제 허브      | Directly matches financial batch-control language.   | Descriptive, less brand-like.    |
| BatchControlKit     | 배치통제 키트      | Good open-source toolkit feel.                       | Toolkit may understate product.  |
| BatchControlPlane   | 배치통제 플레인    | Strong platform architecture meaning.                | Long and infra-heavy.            |
| BatchCheckpoint     | 배치 체크포인트    | Easy mental model: pass checkpoint before execution. | Generic.                         |
| BatchExecutionGuard | 배치 실행 보호     | Very explicit.                                       | Too long for brand.              |
| RunPolicyGate       | 실행 정책 게이트   | Clear Gate naming.                                   | Component-like.                  |
| RunGuardrail        | 실행 가드레일      | Good control metaphor.                               | Guardrail is generic.            |
| JobPolicyGate       | 작업 정책 게이트   | Fits job schedulers.                                 | Job word may narrow positioning. |
| RepoPolicyGate      | 저장소 정책 게이트 | Strong Lite fit.                                     | Too repo-specific for umbrella.  |
| GitPolicyGate       | Git 정책 게이트    | Very clear Lite component name.                      | Too Git-specific for umbrella.   |

### Stewardship / Oversight

| Candidate    | Korean sense       | Fit                                           | Concern                          |
| ------------ | ------------------ | --------------------------------------------- | -------------------------------- |
| BatchVouch   | 배치 보증          | Short; approval evidence is vouched for.      | Vouch may feel casual.           |
| BatchQuorum  | 배치 승인 정족수   | Excellent if multi-approver policy matters.   | Quorum may need explanation.     |
| BatchSteward | 배치 관리 책임자   | Good governance/stewardship feel.             | Softer than control.             |
| BatchCouncil | 배치 승인 위원회   | Good for approver groups.                     | May feel bureaucratic.           |
| BatchCharter | 배치 운영 헌장     | Good governance/policy feel.                  | Less obvious execution control.  |
| BatchAegis   | 배치 보호          | Short and protective.                         | Aegis may be unfamiliar.         |
| BatchAnchor  | 배치 증적 앵커     | Good for tamper-aware evidence.               | Less approval-specific.          |
| JobQuorum    | 작업 승인 정족수   | Useful if job-level approvals are emphasized. | Less batch-specific.             |
| RepoQuorum   | 저장소 승인 정족수 | Strong for maintainer approval model.         | Repo-specific.                   |
| OpsDocket    | 운영 처리대장      | Good request/inbox/audit workflow meaning.    | Docket may be unfamiliar.        |
| OpsWarrant   | 운영 실행권        | Strong control meaning.                       | Legal nuance.                    |
| OpsCustody   | 운영 증적 보관     | Good audit custody meaning.                   | Custody may imply asset custody. |

## Long Candidate Pool That Passed `.com + npm + PyPI`

The following passed the current automated knockout check. They still need GitHub
search, web search, and legal review before selection.

```text
BatchVouch, BatchAttest, BatchWitness, BatchNotary, BatchCustody,
BatchPermit, BatchWarrant, BatchQuorum, BatchSteward, BatchCharter,
BatchCouncil, BatchAegis, BatchAnchor, BatchEvidence, BatchSignoff,
BatchApproval, BatchGrant, BatchClearance, BatchCheckpoint, BatchGovern,
BatchPolicyGate, BatchRulebook, BatchAuditGate, BatchAuditHub,
BatchControlHub, BatchControlKit, BatchControlPlane, BatchCommand,
BatchTraceGuard, BatchExecutionGuard,

RunAttest, RunWitness, RunNotary, RunCustody, RunWarrant, RunSignoff,
RunApproval, RunClearance, RunCheckpoint, RunPolicyGate, RunAuditGate,
RunGuardrail, RunCertify,

JobNotary, JobCustody, JobWarrant, JobQuorum, JobSignoff, JobCheckpoint,
JobPolicyGate, JobAuditGate, JobGuardrail, JobLineage,

RepoVouch, RepoAttest, RepoNotary, RepoCustody, RepoPermit, RepoWarrant,
RepoDocket, RepoQuorum, RepoCharter, RepoCouncil, RepoAegis, RepoAnchor,
RepoEvidence, RepoSignoff, RepoApproval, RepoClearance, RepoCheckpoint,
RepoGovern, RepoPolicyGate, RepoAuditGate, RepoAuditHub, RepoAssure,
RepoLineage, RepoRunControl, RepoRunAudit, RepoRunApproval,

GitVouch, GitAttest, GitWitness, GitPermit, GitWarrant, GitDocket,
GitSignoff, GitApproval, GitRunControl, GitRunAudit, GitPolicyGate,

OpsDocket, OpsWarrant, OpsVouch, OpsAttest, OpsPermit, OpsSignoff,
OpsCustody, OpsLedgerGate,

FlowVouch, FlowAttest, FlowWarrant, FlowSignoff, FlowAuditGate,
FlowPolicyGate,

TaskVouch, TaskAttest, TaskPermit, TaskWarrant, TaskSignoff, TaskAuditGate
```

## Product Naming Patterns To Consider

### One Umbrella Name

Example:

- Project: `BatchPermit`
- GitHub Pages edition: `BatchPermit Lite`
- Server edition: `BatchPermit Server`

Pros:

- Clearer open-source identity.
- Easier package/action/documentation naming.
- Avoids Lite and Server feeling like unrelated products.

Cons:

- The selected name must work for both GitHub repo mode and future installed adapters.

### Umbrella + Component Names

Example:

- Project: `BatchPermit`
- Gate action: `RunAuditGate`
- GitHub Lite workflow: `RepoPolicyGate`

Pros:

- The product name can stay simple while technical components are precise.
- GitHub Lite can use repo-specific wording without trapping the whole product brand.

Cons:

- More names to maintain.

## Current Human-Review Shortlist

No final recommendation is made yet. The next human-review pass should start with:

- `BatchPermit`
- `BatchWarrant`
- `BatchSignoff`
- `BatchAttest`
- `BatchNotary`
- `BatchCustody`
- `BatchQuorum`
- `BatchPolicyGate`
- `BatchControlHub`
- `RunAuditGate`
- `RepoAttest`
- `RepoPermit`
- `OpsDocket`
- `OpsAttest`
- `FlowAuditGate`

## Queries Performed

Infrastructure/package checks:

- Verisign RDAP `.com` checks for generated candidate names.
- npm registry exact checks for compact and hyphenated package forms.
- PyPI exact checks for compact and hyphenated package forms.

Web checks:

- Active product check for `BatchTrail`.
- Exact-name searches for representative candidates including `BatchVouch`,
  `BatchAttest`, `BatchWitness`, `BatchNotary`, `BatchPermit`, `BatchWarrant`,
  `BatchDocket`, `BatchQuorum`, `BatchCustody`, `BatchSignoff`, `BatchGovern`,
  `BatchPolicyGate`, `BatchSteward`, `BatchMinder`, `BatchCharter`, `BatchAegis`,
  `RunVouch`, `RunAttest`, `RunWarrant`, `RunAuditGate`, `RepoAttest`, `RepoVouch`,
  `RepoNotary`, `RepoWarrant`, `OpsDocket`, `OpsWarrant`, `OpsVouch`, `OpsAttest`,
  `FlowAuditGate`, `FlowPolicyGate`, `FlowVouch`, and `FlowAttest`.

Current recommendation confidence: no final recommendation yet. Candidate pool is ready
for owner preference review and deeper clearance on 5-10 preferred names.
