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

After deployment, the expected URL for this repository is:

- `https://always0ne.github.io/batchtrail/`

## Base Path

Vite uses `/` for local development and custom domains by default. For the default repository Pages URL, build with `GITHUB_PAGES=true` so assets and routes are emitted under `/batchtrail/`.

```bash
pnpm --filter @batchtrail/web build
GITHUB_PAGES=true pnpm --filter @batchtrail/web build
VITE_BASE_PATH=/your-repo/ pnpm --filter @batchtrail/web build
```

Use `VITE_BASE_PATH` when the Pages repository name is not `batchtrail` or when a deployment needs a custom subpath.

## Route Fallback

GitHub Pages serves `404.html` for deep links such as `/batchtrail/batches/new`. The Vite build emits a static `404.html` using the configured base path, then redirects the browser to the app root with the original path in `?redirect=...`. On boot, `src/main.tsx` restores the original path before React Router renders.

The router basename is derived from `import.meta.env.BASE_URL`, so the same UI source works for local development, GitHub Pages repository hosting, and later server-backed hosting.

## Static Assets

Brand assets used by the app shell live under `apps/web/public/assets`. References must use Vite's base URL handling, either `%BASE_URL%` in `index.html` or `import.meta.env.BASE_URL` in React code, so `/batchtrail/` repository hosting does not break icon paths.
