# Monorepo migration and ownership

This document defines how baribari evolves from a CLI repository with a nested docs
project into a pnpm workspace that can host the CLI, documentation, shared engine
contracts, and a future desktop client.

## Goals

- Keep the published `baribari` CLI behavior and package contents compatible.
- Use one package manager, one lockfile, and one dependency-review policy.
- Let CLI, desktop, and future headless entry points share stable engine contracts.
- Keep native audio/ASR dependencies out of browser-facing packages.
- Make every build and release target explicit.

## Non-goals for the workspace migration

- Do not build the desktop client as part of the migration.
- Do not rewrite the speech engine in Rust.
- Do not split every source file into a separate package.
- Do not change configuration paths, model paths, session formats, CLI flags, or
  npm package name.
- Do not combine the workspace move with the engine/TUI architectural extraction.

## Current layout

The publishable CLI lives in `apps/cli`. The repository root is a private workspace
orchestrator. Only one npm package is published: `baribari` from `apps/cli`.

```text
baribari/
├── package.json              # private workspace orchestrator
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── scripts/                  # repo-wide tooling (pack-check, pre-commit, fixtures)
├── apps/
│   ├── cli/                  # published npm package (name: baribari)
│   │   ├── package.json
│   │   ├── src/
│   │   ├── dist/             # build output (not committed)
│   │   └── scripts/          # CLI unit tests
│   └── docs/                 # private Astro application
└── packages/                 # added only when boundaries are extracted
```

Intended layout after engine boundary extraction:

```text
baribari/
├── apps/
│   ├── cli/                  # published npm package
│   ├── desktop/              # private Tauri 2 + Svelte application
│   └── docs/                 # private Astro application
├── packages/
│   ├── protocol/             # pure TypeScript commands/events and validation
│   ├── core/                 # platform-neutral session and application logic
│   └── engine-node/          # Node audio, sherpa-onnx, models and translation
└── package.json              # private orchestration root
```

## Dependency direction

Dependencies must remain acyclic:

```text
protocol <- core <- engine-node <- CLI sidecar
    ^          ^                    ^
    └──────── desktop UI            └─ TUI
```

- `protocol` is pure TypeScript and safe to import in a WebView. It must not import
  Node built-ins, filesystem code, secrets, native modules, or UI frameworks.
- `core` owns durable domain behavior such as sessions and settings schemas. It
  must not import ANSI/TUI, Svelte, Tauri, Astro, or platform audio implementations.
- `engine-node` owns microphone/system capture, VAD, ASR, speaker models, model
  downloads, translation execution, and native dependencies.
- Applications own presentation, process lifecycle, and user interaction.
- Avoid a generic `shared` package. Create a package only for a stable boundary with
  at least two real consumers.

## Workspace rules

- Use pnpm only. Commit `pnpm-lock.yaml`; remove every `package-lock.json`.
- Pin the repository pnpm version through the root `packageManager` field.
- All applications under `apps/*` and libraries under `packages/*` are declared in
  `pnpm-workspace.yaml`.
- Workspace applications and unpublished libraries set `private: true`.
- The published CLI package (`apps/cli`, name `baribari`) is the only non-private
  workspace package.
- The private workspace root is intentionally versionless. Release versions live
  only in `apps/cli/package.json`; documentation applications may keep private
  implementation versions of their own.
- Internal dependencies use `workspace:` ranges.
- Root scripts use `pnpm --filter` so it is clear which application is built.
- Do not rely on accidental hoisting. A package must declare everything it imports.
- Supply-chain configuration and dependency procedures are defined in
  [`SECURITY.md`](../../../SECURITY.md).

## Required root commands

The workspace root must provide stable commands for contributors and CI:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm docs:dev
pnpm docs:build
pnpm pack:check
pnpm security:check
```

`test` may compose the existing focused test scripts until a test runner is
introduced. `pack:check` must build and create or inspect the CLI tarball from
`apps/cli` without publishing it. `security:check` must run the configured
vulnerability and registry signature checks; it must not silently fix or mutate
dependencies.

## Acceptance criteria

- A fresh clone installs with the pinned pnpm version and frozen lockfile.
- A dependency with an unreviewed lifecycle script makes installation fail.
- `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- `pnpm docs:build` produces the same `/baribari/` GitHub Pages base and routes.
- `pnpm pack:check` confirms the CLI tarball contains the executable `dist/index.js`,
  declarations, README files, and license, with no docs build or local data.
- `node apps/cli/dist/index.js --help` and the packed CLI entry point still work.
- `packageRoot()` resolves to the CLI package directory (install root), not the
  monorepo repository root.
- Publish CI verifies that `vX.Y.Z` matches `apps/cli` package version and publishes
  only `baribari` from `apps/cli` through npm Trusted Publishing.
- Pages CI deploys from `apps/docs/dist`.
- No npm lockfile or nested pnpm lockfile remains.

## Future extraction sequence

Once the workspace CLI relocation is stable:

1. Extract `packages/protocol` with versioned engine commands and events.
2. Introduce a UI-independent engine lifecycle and test it without a terminal.
3. Extract `core` only where it has both CLI and desktop consumers.
4. Move native execution into `engine-node` or a dedicated sidecar entry point.
5. Add `apps/desktop`; keep Tauri responsible for windows, tray, updates, and
   supervising the Node engine rather than reimplementing ASR.

Each stage should be independently releasable and must avoid changing session or
event data without an explicit schema migration.
