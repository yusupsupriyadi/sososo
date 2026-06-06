# Contributing to sososo

Thanks for your interest in contributing! This is a Windows desktop app built
with Tauri 2 (Rust) + React 19 (TypeScript). Please also read our
[Code of Conduct](./CODE_OF_CONDUCT.md).

## Prerequisites

- **Windows 10/11** — audio capture uses WASAPI; the app does not run on
  macOS/Linux.
- [Bun](https://bun.sh) — the package manager (**do not** use npm/yarn/pnpm).
- [Rust](https://rustup.rs) — stable toolchain (`rustfmt` + `clippy`
  components).
- [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)
  (preinstalled on current Windows).

## Getting started

```sh
bun install
bun run tauri dev   # run the full desktop app
```

To work on the UI in a plain browser (no Tauri APIs): `bun run dev` →
http://localhost:1420.

## Verifying your changes

There is no unit-test framework yet. Verification is:

- `bun run build` — TypeScript typecheck + Vite build (TS is **strict**;
  unused vars/params fail the build).
- `cargo check` / `cargo clippy` — from `src-tauri/`.
- `cargo run --example audio_probe -- 6` — from `src-tauri/`; writes
  `audio_probe.wav` and prints per-channel RMS to confirm both channels carry
  audio.

## Code style (enforced)

Formatting is automated and **enforced by a pre-commit hook** (Husky +
lint-staged). On commit, staged files are formatted automatically:

- **Web** (`.ts/.tsx/.js/.json/.css/.md/.yml…`) → Prettier (incl. Tailwind class
  sorting).
- **Rust** (`.rs`) → `rustfmt`.

Run them manually any time:

```sh
bun run format        # Prettier write
bun run format:check  # Prettier check (CI gate)
bun run fmt:rust      # cargo fmt
bun run fmt:rust:check # cargo fmt --check (CI gate)
```

Config lives in `.prettierrc.json`, `src-tauri/rustfmt.toml`, `.editorconfig`,
and `.gitattributes` (LF line endings).

## Commits & pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(scope): …`, `fix(scope): …`, `docs(…)`, `chore(…)`, `refactor(…)`,
  `style(…)`, `ci(…)`.
- Keep each commit to **one focused change**; don't bundle unrelated edits.
- Open a PR against `master`. Fill in the PR template, describe the change, and
  make sure `bun run build`, `format:check`, and `fmt:rust:check` pass.
- All user-facing UI strings are in **English**.

## Documenting your work

This project keeps a lightweight knowledge base in
[`.development-history/`](./.development-history). When you add or change a
feature, drop a short, terse Markdown report there (goal, key changes,
decisions, verification) in English.

## Reporting bugs & ideas

Use the [issue templates](https://github.com/yusupsupriyadi/sososo/issues/new/choose).
For security issues, follow [SECURITY.md](./SECURITY.md) instead of opening a
public issue.
