# Nova-3 for all languages + session history (SQLite)

- **Date:** 2026-06-05
- **Milestone:** closes **D (SQLite persistence)** + STT language expansion.

## Goal

1. Move **all** languages to Deepgram **Nova-3** (previously only `multi`/`en`; rest on Nova-2).
2. Implement the **history feature** (was a static `SAMPLE_SESSIONS` placeholder): persist sessions +
   transcripts, real list, open/read old transcripts, delete, rename.

## Research (2 sources)

- Nova-3 now supports **Indonesian (`id`) streaming** (Deepgram, Jan 2026), lower WER than Nova-2.
- Nova-3 supports ~50+ languages + `multi` (code-switching).
- Rust SDK `deepgram 0.10`: `Model::Nova3` + `Language::Other(String)` → all BCP-47 codes map to Nova-3.

## Changes

**Languages (all Nova-3):**

- `src/lib/languages.ts` _(new)_ — full Nova-3 language list (Bahasa labels), `multi`+`id` pinned on top;
  `languageLabel()`.
- `configStore.ts` — `LanguageCode` → `string`. `LibraryRoute.tsx`/`SettingsRoute.tsx` render from `LANGUAGES`.
  `session.rs` — `model_language()` always `Model::Nova3`.

**History (SQLite, Milestone D):**

- `Cargo.toml` — add `rusqlite` (`bundled`). `error.rs` — `AppError::Db` + `From<rusqlite::Error>`.
- `src-tauri/src/db.rs` _(new)_ — `Db(Mutex<Connection>)`, schema `sessions` + `segments` (FK cascade, WAL),
  serde types, ops: `create_session`, `finalize_session` (set `ended_at` or drop empty session),
  `upsert_segment`, `list_sessions`, `get_session`, `delete_session`, `rename_session`.
- `lib.rs` — `mod db`, open DB at `app_data_dir()/sososo.db` in `setup()` + `manage`, register 4 commands.
- `commands.rs` — `start_session` inserts session row (default title `Rekaman dd-mm-YYYY HH:MM`), returns DB id;
  new commands `list_sessions`/`get_session`/`delete_session`/`rename_session`.
- `session.rs` — `spawn_session` takes `session_id` (drop `NEXT_ID`); store **final** segments (idempotent);
  teardown calls `finalize_session`.
- Frontend: `types/domain.ts`, `lib/ipc.ts` (4 wrappers), `lib/format.ts` _(new, id-ID locale)_,
  `SessionSidebar.tsx` (real list + refresh on stop + "new recording"), `SessionDetailRoute.tsx` _(new)_
  (read transcript + inline rename + two-step delete), `MainApp.tsx` (`session/:id` route), `main.css`.

## Decisions

- **Sync `rusqlite`** (not `tauri-plugin-sql`/`sqlx`): segments are produced backend-side, so writing from Rust
  is most natural. Write only `is_final` segments (interim upserted in memory only).
- Session id from DB `AUTOINCREMENT` (not an in-memory counter) — avoids cross-restart id collisions.
- Empty sessions auto-dropped on teardown/fail. Custom commands need no new Tauri capability.

## Verification

- `bun run build` — OK. `cargo check` — OK. `cargo clippy` — clean (2 pre-existing warnings in `audio/mixer.rs`).

## Follow-ups

- Title input at recording start (currently default + rename). Some Nova-3 langs may be batch-only (errors
  surfaced in UI, no crash). Milestone E (AI summary) still placeholder.
