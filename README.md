# BatchTrail

Git-native Batch Control & Audit.

BatchTrail starts with **Repo Mode**, a GitHub repository-backed way to model batch
definitions, execution requests, approval evidence, dispatcher workflows, and Gate
decisions. It is designed to grow into **BatchTrail Control Plane** for installable
enterprise use.

## Development

This repository uses pnpm workspaces.

```bash
corepack prepare pnpm@10.14.0 --activate
pnpm install
pnpm dev
```

## Workspace

```text
apps/web              React/Vite Repo Mode UI
packages/domain       Shared domain types
packages/digest       Canonical payload utilities
packages/github-lite  GitHub Repo Mode client contracts
actions/gate          BatchTrail Gate Action scaffold
actions/dispatcher    BatchTrail Dispatcher Action scaffold
```

## Internationalization

The default UI language is English. Korean is bundled by default. New languages
should be added by contributing locale JSON resources and updating the supported
locale registry.
