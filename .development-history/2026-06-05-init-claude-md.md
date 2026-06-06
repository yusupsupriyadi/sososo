# Init CLAUDE.md — Codebase Analysis & Documentation

- **Date:** 2026-06-05
- **Task:** `/init` — analyze the repo and (re)generate `CLAUDE.md`.

## Goal
Replace the minimal `CLAUDE.md` (which only carried the `.development-history` rule) with a high-signal
guide (commands + architecture), preserving the development-history rule.

## Analyzed
Full source tree (`src/`, `src-tauri/src/`) + config (`package.json`, `tsconfig.json`, `vite.config.ts`,
`Cargo.toml`, `tauri.conf.json`, `capabilities/*.json`).

## Key findings (now in CLAUDE.md)
- **Project:** `sososo` — Windows real-time meeting transcription. WASAPI loopback + mic → Deepgram live STT
  → glass overlay + main window. UI in Bahasa Indonesia.
- **Stack:** Tauri 2 (Rust) + React 19 / React Router 7 / Zustand 5 / Vite 7 (TS). Package manager: **Bun**.
- **Windows:** at this date a two-window, one-build model (`HashRouter` `#/main`, `#/overlay`); overlay built
  at runtime in `lib.rs setup()` so acrylic applies before first paint.
- **Audio pipeline:** MTA threads → WASAPI polling + autoconvert (16 kHz/16-bit/mono) → bounded crossbeam
  (drop-on-lag) → `Interleaver` (mic=ch0, system=ch1) → 40 ms tokio bridge → `futures::mpsc` → Deepgram.
- **IPC/events:** commands in `commands.rs` (registered in `lib.rs`), TS wrappers in `lib/ipc.ts`,
  camelCase↔snake_case; global `session://state` + `transcript://segment`; segments upserted by `segmentId`.
- **Secrets:** API keys in Windows Credential Manager (`keyring`); only `has_api_key` exposed.
- **Verification:** no test framework — `bun run build`, `cargo check`/`clippy`, `audio_probe` example.
- **Milestones:** A/B/C done; D (SQLite) + E (AI summary) pending at this point.

## Environment
- `bun` 1.3.10; `cargo` 1.96.0 (rustup, `~/.cargo/bin`, invoked via `bun run tauri *`). Not yet a git repo.

## Files changed
- `CLAUDE.md` — rewritten (overview, commands, architecture, conventions); kept `.development-history` rule.
- `.development-history/2026-06-05-init-claude-md.md` — this report (folder created).
