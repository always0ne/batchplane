# GitHub Pages Hosting

BatchPlane Lite is a static React app, so the Lite UI can be hosted from GitHub Pages without a server. The runtime data still comes from the configured GitHub repository through the user's session token.

## Repository Settings

This repository deploys GitHub Pages through `.github/workflows/pages.yml`.

In GitHub repository settings:

1. Open `Settings` -> `Pages`
2. Set `Build and deployment` source to `GitHub Actions`

Deployments run on:

- push to `main`
- manual `workflow_dispatch` from the Actions tab

After the repository rename, the expected URL is:

- `https://always0ne.github.io/batchplane/`

Before the GitHub repository is renamed, the same workflow still deploys under
the current repository path:

- `https://always0ne.github.io/batchtrail/`

## Base Path

Vite uses `/` for local development and custom domains by default. For GitHub
Pages, pass `VITE_BASE_PATH=/{repository-name}/` so assets and routes follow
the actual repository name before and after rename.

```bash
pnpm --filter @batchplane/web build
VITE_BASE_PATH=/batchplane/ pnpm --filter @batchplane/web build
VITE_BASE_PATH=/batchtrail/ pnpm --filter @batchplane/web build
VITE_BASE_PATH=/your-repo/ pnpm --filter @batchplane/web build
```

The CI and Pages workflows set `VITE_BASE_PATH` from
`${{ github.event.repository.name }}`, so the deployed bundle follows a GitHub
repository rename without another Pages-specific code change.

## Route Fallback

GitHub Pages serves `404.html` for deep links such as
`/batchplane/batches/new`. The Vite build emits a static `404.html` using the
configured base path, then redirects the browser to the app root with the
original path in `?redirect=...`. On boot, `src/main.tsx` restores the original
path before React Router renders.

The router basename is derived from `import.meta.env.BASE_URL`, so the same UI source works for local development, GitHub Pages repository hosting, and later server-backed hosting.

## Static Assets

Brand assets used by the app shell live under `apps/web/public/assets`.
References must use Vite's base URL handling, either `%BASE_URL%` in
`index.html` or `import.meta.env.BASE_URL` in React code, so repository-path
hosting does not break icon paths.
