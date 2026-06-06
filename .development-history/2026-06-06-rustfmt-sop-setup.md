# rustfmt SOP setup (Rust formatting)

**Goal:** Extend the formatting SOP to the Rust backend (`src-tauri/`), the
companion to the earlier Prettier setup. See
[Prettier SOP setup](2026-06-06-prettier-sop-setup.md).

## Key changes

- No deps: `rustfmt` ships with the rustup toolchain (`rustfmt 1.9.0-stable`).
- `src-tauri/rustfmt.toml` — stable options only, kept near the Rust default
  (the de-facto SOP): `edition = "2021"`, `max_width = 100` (matches Prettier
  printWidth 100), `tab_spaces = 4`, `newline_style = "Unix"`. Unstable options
  (`imports_granularity`, `group_imports`) are avoided — they need nightly.
- `package.json` scripts: `fmt:rust` (`cargo fmt --manifest-path
src-tauri/Cargo.toml`) and `fmt:rust:check` (+ `-- --check`).
- `lint-staged`: added `src-tauri/**/*.rs` → `rustfmt --edition 2021`, so staged
  Rust files auto-format on commit via the existing Husky pre-commit hook
  (standalone `rustfmt` defaults to edition 2015, hence the explicit flag; it
  also resolves `src-tauri/rustfmt.toml` by walking up from each file).

## Decisions

- Default rustfmt config is intentional — it IS the Rust community standard.
- One-time normalization run over the eligible Rust sources.
- **Multi-agent care (shared working dir):** another agent was concurrently
  building a live-translation feature, actively editing `src/ai.rs`,
  `src/commands.rs`, `src/db.rs`, `src/lib.rs`. Those four were excluded from the
  normalization pass (computed as the live complement of `git status`); the new
  rustfmt lint-staged hook will format them automatically on that agent's next
  commit. Of the 12 eligible files only 4 actually needed reformatting; with
  rapid concurrent commits on the shared branch, `build.rs`/`main.rs` landed in
  adjacent commits and `audio/capture.rs`/`audio/devices.rs` in the dedicated
  `style(rust)` commit. End state: all 12 eligible files are formatted.

## Verification

- `rustfmt --edition 2021 --check` on the 12 eligible files — exit 0
  (well-formed and idempotently formatted).
- Full `cargo check` deferred: the crate currently carries another agent's
  in-progress edits (ai/commands/db/lib) that would produce false negatives.
  Formatting is whitespace-only / non-semantic; `fmt:rust:check` covers it going
  forward.

## Commits

- `chore(rust): set up rustfmt and wire it into lint-staged`
- `style(rust): format with rustfmt`
- this doc.
