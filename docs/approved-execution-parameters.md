# Approved Execution Parameters

[한국어](./approved-execution-parameters.ko.md)

## Authority And Status

This is the complete implementation contract for #212: the concrete technical
proposal dated 2026-10-09, approved for local implementation on 2026-10-11.
It specializes the [Lite SRS](./github-lite-srs.md),
[technical spec](./github-lite-technical-spec.md) and
[schedule contract](./schedule-execution-contract.md), without changing approval
policy or adding Main implementation.

Readiness is `AVAILABLE` after the 2026-10-11 source review, complete local checks
and EN/KO browser review at 1440px and 390px. This means the implemented flow is
ready for user QA, not that operating acceptance passed. Actual-provider key upload,
manual/scheduled delivery, runner behavior and numeric supported bounds remain
`NOT_TESTED`. Documentation, source inspection, mocks, local CI and browser checks
must not be presented as live execution or release proof. Live writes/execution
require separate user authorization; remote CI tracking and merge belong to the
owner. Prior version-specific QA results remain intact.

## Definitions And Selection

Definitions belong to the approved Batch revision. Each has an exact `name`,
`required`, `sensitive` and optional `defaultValue`. Requests may select inputs,
not add names or change these flags. Schedule settings contain selections for
the same definitions and are approved in the owning Batch change request.

| Rule        | Contract                                                                                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name        | `^[A-Za-z_][A-Za-z0-9_]*$`; reject exact and case-only duplicates. Preserve spelling/case; no trimming, sanitizing or uppercasing.                                                                         |
| Value       | A literal string, including `""`, whitespace-only strings, leading zeroes, Unicode and newlines. No number/boolean/JSON coercion or expression evaluation.                                                 |
| Required    | Check presence, not length. A supplied empty string satisfies presence and reaches the command unchanged.                                                                                                  |
| Optional    | Omission and explicit empty are different. Omission produces no parameter environment variable.                                                                                                            |
| Default     | A selected approved default, not a fallback for empty input, failed authorization or failed decryption. An absent default is not an empty default.                                                         |
| NUL         | Reject NUL; do not remove it or alter the rest of the value. Recheck after decryption before command start.                                                                                                |
| Sensitivity | Applies to ordinary/sensitive defaults, overrides and schedule values. Changing sensitive to ordinary cannot reveal saved ciphertext as a plaintext default; enter a new value through the change request. |

The selection contract is `ParameterSelection`:

```ts
type ParameterSelection =
  | { name: string; source: "DEFAULT" | "OMIT" }
  | { name: string; source: "VALUE"; value: ParameterInputValue };

type ParameterInputValue =
  | { kind: "VALUE"; value: string }
  | { kind: "SAVED"; reference: string };
```

`DEFAULT` is usable only with an existing approved default. `VALUE` supplies the
exact entered string, even when empty. `OMIT` is allowed only for optional inputs.
Manual requests explicitly select each definition. Schedules resolve their
definition-based selections against the approved revision; a definition without
a schedule override inherits its default, or is omitted if optional and no
default exists. A required input without a selected value/default blocks the
request or occurrence before business admission.

Saved sensitive values appear in product UI/client contracts as opaque `SAVED`
references, not plaintext or provider/JWE DTOs. The adapter resolves the reference
only against the verified repository, Batch, exact name, origin and source
revision. Reusing a default or saved schedule override copies its ciphertext;
the browser does not decrypt/re-encrypt it. A mask/placeholder is not an input.
Lite can show a newly entered value while composing, but has no saved-value
reveal operation. Do not store sensitive plaintext in Issue/PR bodies, repository
YAML, canonical evidence, browser storage or handoff state.

## Storage And Approval Binding

Ordinary values are persisted as strings. New sensitive values are authenticated
ciphertext, not `valueDigest`-only records or plaintext hashes:

```json
{
  "sensitive": true,
  "encrypted": {
    "version": 1,
    "keyId": "<public-JWK-thumbprint>",
    "jwe": "<compact-JWE>"
  }
}
```

The Lite adapter uses `jose@6.2.12`, JWE Compact Serialization, and an allowlist
of only `alg: RSA-OAEP-256` and `enc: A256GCM`. Generate RSA-2048 through the
documented `generateKeyPair` API, export a public JWK and transient private
PKCS#8, and identify the key by the public JWK SHA-256 thumbprint. The protected
header's key identity and envelope identity must agree. No custom cryptographic
primitive or generic key-provider framework is included.

JWE plaintext is UTF-8 JSON with the exact `value` and context
`{ repositoryId, batchId, parameterName, origin }`. `repositoryId` is GitHub's
stable repository ID, interpreted inside the adapter, not a renameable owner/name.
Value origins are `{ type: "BATCH_DEFAULT" }`,
`{ type: "SCHEDULE_VALUE", scheduleId }`, or
`{ type: "REQUEST_VALUE", requestId }`. Encryption binds the original location;
the enclosing approval binds each later reuse. Public-key encryption does not
establish author identity or approval.

New parameterized canonical execution payloads require
`spec.parameterContractVersion: "PARAMETER_DELIVERY_V1"` and
`spec.parameterSourceRevision`, the verified approved Batch merge SHA. Their
`spec.parameters` is keyed by exact definition name. Each selected value carries
its sensitivity, ordinary value or exact encrypted envelope, and verified
`source.origin`; Batch defaults/schedule overrides also carry `source.revision`.
Optional omission is explicit approval evidence with `source.origin.type: "OMIT"`
and no delivered value, not a decryptable JWE origin.

The existing canonical request digest covers the contract version, source SHA,
selected values/omissions, sensitivity, exact ciphertext and origin/source
revision together with existing request/Batch/workflow context. Validate sources
against the approved definition/schedule snapshot, not a caller's claims. Reused
ciphertext must equal that source. Do not include a future commit SHA or final
digest inside data that creates that same SHA/digest. No parallel approval record
or migration framework is added.

`PARAMETER_DELIVERY_V1` selects exact canonical JSON: sort own object keys
recursively, preserve array order and every string code unit, retain explicit
empty strings/null, and omit only undefined object members. Hash its UTF-8
encoding with SHA-256. CR, LF and CRLF are distinct values; no newline or Unicode
normalization applies. Legal names such as `__proto__` remain ordinary own keys.
Source-value comparisons use the same exact representation. Requests without
this version retain their historical digest algorithm; no old approval is rewritten.

Manual selection is materialized before approval. Native schedule selection is
materialized when recording the occurrence from its verified approved
Batch/schedule revision, then checked by Gate. Later default edits do not mutate
an already approved request or resolve a mutable latest-default pointer at run
time. Mutated ciphertext/source, wrong context/key, decryption failure or missing
required data must prevent the business command from starting.

Legacy hash-only sensitive history remains readable. It cannot be decrypted or
made executable by adding plaintext after approval; create a replacement request
with supplied inputs. Existing parameter-free requests/history remain unchanged.

## Workspace Encryption Setup

The Workspace administrator uses the existing settings UI. Ordinary-only and
parameter-free batches do not require Secrets-write access. New sensitive-value
use requires applied public configuration and successful registration of the
matching private key.

Sensitive-value submission additionally requires repository `Secrets: read` on
the requester's fine-grained PAT to inspect `BATCHPLANE_INPUT_KEY` metadata.
Ordinary requesters do not need `Secrets: write` or the private key. Applied
public configuration plus PRESENT Secret metadata is a setup-readiness check
only; ABSENT or UNKNOWN/unreadable metadata cannot be ready. Neither PRESENT nor
UNKNOWN proves cryptographic key-pair correspondence or runner decryption.
Initial maintainer setup requires repository `Secrets: write` for upload, in
addition to the existing configuration-PR permissions and administrator authority.
Ordinary-only/parameter-free submission does not depend on this metadata check.

| Material                 | Location and responsibility                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public config            | `.batch-governance/parameter-encryption.yml`, through the existing reviewed configuration PR; `version: 1`, `keyId`, public RSA JWK (`kty`, `n`, `e`). No private fields. |
| Private key              | One repository Actions Secret, `BATCHPLANE_INPUT_KEY`, containing private PKCS#8 for this Workspace. No per-parameter Secret catalogue.                                   |
| GitHub upload encryption | `libsodium-wrappers@0.8.4` only for encrypting the private key with GitHub's upload public key. This is separate from product JWE encryption.                             |
| Preparation APIs         | `@actions/core@3.0.1` in the Gate companion Action for masking and outputs. No unrelated Action migration.                                                                |

1. Verify connection and administrator authority. Inspect existing public config,
   pending setup request and Secret metadata before initialization.
2. Generate a transient pair only for initial setup. Create the public-config PR
   first and retain the created request link.
3. Upload that same private key to `BATCHPLANE_INPUT_KEY`; never substitute a new
   pair. Public-config approval/merge follows the existing policy.
4. Report setup recorded only when public configuration is applied and private
   registration succeeded. PR creation, Secret upload and merge are separate,
   non-atomic operations; partial success must remain visible.
5. A retry in the same connected product-client setup session may reuse the
   retained pair when safe; the session must survive an upload failure, not live
   in browser storage. On reconnect, inspect only: no automatic regeneration,
   overwrite or recovery.
   If transient private material is lost or existing config/Secret disagrees,
   show incomplete setup for explicit administrator resolution. Preserve the
   original request link; do not claim completion or rotate keys silently.

Private material stays transient during setup, never in local/session storage,
repository files, PR bodies or logs. Existing Secret presence is not permission
to overwrite it. GitHub Secret metadata cannot prove key-pair correspondence or
runtime decryption. A local pair check and upload evidence establish setup, not a
runner pass. The first separately authorized approved execution supplies actual
runtime evidence; no verification workflow, key backup/rotation service, retry
engine or saved-value reveal is added.

GitHub Secret PUT is an upsert, not create-if-absent. Presence is rechecked and
same-client initialization is coalesced, so existing keys are not knowingly
overwritten; this does not provide atomic exclusion between two administrators.
Initial setup must use one administrator session. No new lock/recovery subsystem
is approved.

## Workflow Upgrade And Delivery

Parameter-free existing batches keep their execution path without encryption
setup or forced migration. Registration and parameter additions to an existing
Batch update its definition and generated workflow in one Batch change request.
Workspace shared-installation updates are separate; a current dispatcher alone
does not establish per-Batch input readiness. Do not overwrite unrelated workflows
or introduce unified multi-Batch migration requests.

`hasParameterDelivery` inspects executable YAML semantics, not a support comment
or template version alone: the same business job must contain the expected
preparation Action before `Run batch`, correct request bindings, no preparation
`continue-on-error: true`, and the exact output-to-step-env mapping. Check the
manual path and each enabled native schedule business path. The UI shows a
blocking reason and Batch change link for missing delivery support. The runtime
must enforce the same contract; hiding a button is insufficient.

Use the Gate companion Action at `actions/gate/input-preparation`, built by the
Gate package. It physically reuses Gate authorization; do not duplicate policy
or create a generic runner SDK. In the existing business job it verifies the same
approved request/revision/digest snapshot, loads selected inputs, decrypts
sensitive values, validates context/value, registers masking and publishes:

```ts
core.setOutput("environment", JSON.stringify(environment));
```

Bind only the existing native business step:

```yaml
- name: Run batch
  env: ${{ fromJSON(steps.prepare.outputs.environment) }}
  run: <existing approved batch command>
```

The map contains only selected `BATCHPLANE_PARAM_<exact name>` keys with string
values. Omission has no key; explicit empty remains `""`. Missing, malformed or
unauthorized preparation output must fail before command start, never fall back
to `{}`. No value interpolation into shell source, automatic command-line
arguments, JSON-file interface, `GITHUB_ENV`, new workflow/job or command launcher
is introduced. Dispatch/inter-job outputs retain only necessary IDs/digests;
business plaintext and the private key are not transferred between jobs.

Supply `${{ secrets.BATCHPLANE_INPUT_KEY }}` only to input preparation. The private
key must never become a parameter, environment output, `GITHUB_ENV` entry or
business-command variable. Preserve verified-SHA checkout, working directory,
native command/shell, exit status, streaming logs, real cancellation, business-log
region and execution-detail links. The existing Bash `trap` path and unspecified
shell do not prove Windows support; #212 adds no runner-platform support claim.

## Masking, Trust And Outcomes

Register `core.setSecret` for sensitive plaintext and its JSON-escaped form before
publishing the environment output. Do not log the map or key. Test the actual
representations exposed by expression diagnostics and logs, without printing the
synthetic secret for comparison. Masking is not encryption or Secret storage.

Same-job outputs use runner files; delivery is neither encrypted nor memory-only.
Other steps do not automatically inherit `Run batch.env` but may reference its
outputs. Trusted batch code can export/transform values; workflow administrators
and runner administrators can access them. This is not a confidentiality sandbox
and does not guarantee suppression of every transformed secret.

Verified preparation denial with exact request/Run/job/step evidence can project
`BLOCKED`: the command did not start. Missing/unreadable/uncorrelated evidence must
remain `UNCONFIRMED`; a failed preparation job alone is not proof of a business
failure. Business failure requires verified command start and actual failure
evidence. Preserve the approval, failure reason and source links without changing
an approved request or fabricating a business result.

## Limits And Acceptance

No arbitrary common name-length, count or value-length caps are approved, and
this is not unlimited support. Measure final persisted request/change evidence,
including JWE and escaping. A provider rejection must retain the draft and show
actionable corrective guidance: no truncation, dropped fields or silent retry.
Validate plaintext currently held in the form; reused ciphertext is not revealed
just to repeat validation. Runtime rechecks decrypted values and NUL.

Numeric final-payload, output and process-environment support limits require
authorized actual-provider/runner evidence, with versions, OS and launch path.
Do not claim an assumed Issue-body maximum, universal OS bound or Main limit.
If the approved literal-value path needs a material restriction, report it for
owner review rather than silently replacing the delivery mechanism.

[QA-L06](./user-qa.md#qa-l06-approved-parameters-become-actual-business-command-inputs)
covers setup, defaults/overrides, two schedules, presence/empty/omit, tampering,
legacy history and old workflows. Revalidate connected QA-L01-L03, QA-L05-L09,
QA-L12, QA-L15 and QA-L18 by tested version/environment; do not overwrite old
passes. Parent integration owns the complete local README sequence and
English/Korean desktop/mobile browser review. Local checks, actual-provider QA,
remote CI, release and merge are separate evidence. This documentation sidecar
requires only scoped content/link/parity/diff/format checks and adds no QA pass.

## Official References

These are the official bases used by the approved proposal, not evidence of a
successful BatchPlane execution or an invitation to upgrade dependencies:

- [jose 6.2.12 CompactEncrypt](https://github.com/panva/jose/blob/v6.2.12/docs/jwe/compact/encrypt/classes/CompactEncrypt.md) and [key generation](https://github.com/panva/jose/blob/v6.2.12/docs/key/generate_key_pair/functions/generateKeyPair.md).
- [GitHub Secrets upload encryption](https://docs.github.com/en/rest/guides/encrypting-secrets-for-the-rest-api) and [repository Secret metadata/permissions](https://docs.github.com/en/rest/actions/secrets#get-a-repository-secret).
- [Toolkit masking/outputs](https://github.com/actions/toolkit/tree/main/packages/core#inputsoutputs) and [same-job masked output](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#example-masking-a-generated-output-within-a-single-job).
- [fromJSON](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#fromjson), [step env](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsenv) and [cancellation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation).
- [Node.js naming](https://nodejs.org/docs/latest-v24.x/api/environment_variables.html#variable-names): a product naming rule, not a universal OS rule or a new .env interface.
- [Issue creation API](https://docs.github.com/en/rest/issues/issues#create-an-issue), [Linux execve constraints](https://man7.org/linux/man-pages/man2/execve.2.html) and [Windows environment mechanisms](https://learn.microsoft.com/en-us/windows/win32/procthread/environment-variables): references for supported-bound investigation, not measured support.
