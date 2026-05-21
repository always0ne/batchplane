# Repository Rename Runbook

BatchPlane was selected after the BatchTrail name conflict review. The GitHub
repository may be renamed from `always0ne/batchtrail` to
`always0ne/batchplane`, but the rename must be performed as an explicit release
operation because target repositories embed this repository in generated
GitHub Actions workflows.

## Pre-Rename State

The codebase now emits BatchPlane-facing identifiers for new Lite artifacts:

- package scope: `@batchplane/*`
- schema API version: `batchplane.io/v1`
- Issue labels and hidden markers: `batchplane:*`
- setup branch prefix: `batchplane/install/lite-*`
- registration branch prefix: `batchplane/register/*`
- dispatcher workflow: `.github/workflows/batchplane-dispatcher.yml`
- generated Gate job: `batchplane-gate`

Compatibility readers still accept legacy BatchTrail evidence:

- `batchtrail.io/v1`
- `batchtrail:*` labels and hidden markers
- `batchtrail/register/*` registration PR branches
- `.github/workflows/batchtrail-dispatcher.yml`
- `.github/workflows/batchtrail-sample-target.yml`

The generated action reference intentionally remains centralized as
`always0ne/batchtrail` until the GitHub repository is actually renamed.

## Rename Steps

1. Rename the GitHub repository to `batchplane` in GitHub repository settings.
2. Confirm GitHub Pages is still configured to deploy through GitHub Actions.
3. Verify the Pages deployment URL changes to:

   ```text
   https://always0ne.github.io/batchplane/
   ```

4. Change `batchPlaneActionRepository` in
   `apps/web/src/shared/github-action-references.ts` from
   `always0ne/batchtrail` to `always0ne/batchplane`.
5. Rebuild and run the full local CI-equivalent checks.
6. Test a fresh private target repository installation and one execution
   approval cycle.
7. Add a release note telling existing Lite users that old generated workflows
   can keep working through GitHub redirects, but new installation PRs emit
   BatchPlane identifiers.

Do not remove legacy readers until a later compatibility policy explicitly says
old Lite repositories are unsupported.
