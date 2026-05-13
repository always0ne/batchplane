# BatchTrail Brand Guidelines

This document defines the baseline BatchTrail color tokens used by the web app.
The tokens are intentionally small so Repo Mode can stay restrained, audit
friendly, and easy to extend.

## Color Tokens

| Name         | CSS variable        | Tailwind token | Hex       | Usage                                                      |
| ------------ | ------------------- | -------------- | --------- | ---------------------------------------------------------- |
| Graphite     | `--bt-graphite`     | `bt-graphite`  | `#20242a` | Primary text, high-emphasis headings, dark code surfaces   |
| Control Teal | `--bt-control-teal` | `bt-control`   | `#119c8d` | Primary actions, active navigation, control-state emphasis |
| Git Copper   | `--bt-git-copper`   | `bt-git`       | `#e4572e` | Git/repository accents, branch and workflow cues           |
| Ledger Amber | `--bt-ledger-amber` | `bt-ledger`    | `#f5b841` | Audit, evidence, warning, and ledger accents               |
| Surface      | `--bt-surface`      | `bt-surface`   | `#f7f8fa` | App background and quiet page surfaces                     |
| Muted        | `--bt-muted`        | `bt-muted`     | `#58616c` | Secondary text and low-emphasis metadata                   |

## Implementation Contract

- CSS variables are declared in `apps/web/src/shared/styles/global.css`.
- Tailwind color aliases are exposed under `theme.extend.colors.bt` in
  `apps/web/tailwind.config.ts`.
- New UI work should use the Tailwind token names rather than hard-coded brand
  hex values.
- New brand colors should be added here first, then mapped to CSS variables and
  Tailwind tokens in the same change.
