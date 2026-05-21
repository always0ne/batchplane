# Repository Rename Runbook

BatchPlane was selected after the BatchTrail name conflict review. The GitHub
repository has been renamed from `always0ne/batchtrail` to
`always0ne/batchplane`. This document remains as the operational record because
target repositories embed this repository in generated GitHub Actions workflows.

## Current State

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

The generated action reference is centralized as `always0ne/batchplane`.
Legacy target repositories that still reference `always0ne/batchtrail` depend on
GitHub repository redirects until their setup artifacts are regenerated.

## Rename Completion Checklist

1. Confirm the GitHub repository is `always0ne/batchplane`.
2. Confirm the local `origin` remote points at
   `https://github.com/always0ne/batchplane.git`.
3. Confirm GitHub Pages is still configured to deploy through GitHub Actions.
4. Verify the Pages deployment URL is:

   ```text
   https://always0ne.github.io/batchplane/
   ```

5. Keep `batchPlaneActionRepository` in
   `apps/web/src/shared/github-action-references.ts` set to
   `always0ne/batchplane`.
6. Rebuild and run the full local CI-equivalent checks.
7. Test a fresh private target repository installation and one execution
   approval cycle.
8. Add a release note telling existing Lite users that old generated workflows
   can keep working through GitHub redirects, but new installation PRs emit
   BatchPlane identifiers.

Do not remove legacy readers until a later compatibility policy explicitly says
old Lite repositories are unsupported.
