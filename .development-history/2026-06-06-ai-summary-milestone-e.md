# Finish transcript + AI summary (Milestone E / OpenAI)

- **Date:** 2026-06-06
- **Milestone:** closes **E (AI summary / OpenAI)**.

## Goal
User request: a **"Finish transcript"** action on a recorded session that triggers **AI summary generation**
from the stored transcript, then displays and persists the summary.

## Research (context7)
- OpenAI **Chat Completions**: `POST /v1/chat/completions`, body `{ model, messages, temperature }`, response
  `choices[].message.content`; error `{ error: { message } }`.
- Default model **`gpt-4o-mini`** (cheap, 128k context, capable enough) — stored as a constant.

## Decisions
- **Direct HTTP via `reqwest`** (not `async-openai`): `reqwest` is already in the tree (via `deepgram`, rustls)
  → minimal deps, no SDK mismatch. Manifest: `default-features = false, features = ["json", "rustls"]` to avoid
  native-tls/OpenSSL on Windows. (reqwest 0.13 feature is `rustls`, not `rustls-tls`.)
- **Manual trigger** (button on session detail), not auto-on-stop — gives the user cost control. Summary
  **always Bahasa Indonesia**, fixed Markdown: `## Ringkasan` / `## Poin Penting` / `## Tindak Lanjut`.
- OpenAI key read from Windows Credential Manager, never sent to the frontend.
- **Async without holding a lock**: read transcript (sync) → `await` OpenAI (no guard held) → save (sync), so
  the future stays `Send`.

## Changes
**Backend:**
- `Cargo.toml` — add `reqwest 0.13` (rustls). `error.rs` — `AppError::Ai` + `From<reqwest::Error>`.
- `src-tauri/src/ai.rs` *(new)* — OpenAI client: `render_transcript()` (speaker labels, 60k char cap),
  `summarize()` (build prompt, call API, handle 401/non-200, return `(summary, model)`).
- `db.rs` — new columns `summary`/`summary_model`/`summarized_at`; `migrate()` + `table_columns()` for old DBs;
  `save_summary()`; SELECTs updated.
- `commands.rs` — async `summarize_session(id)`: load transcript → check non-empty → get key → `ai::summarize`
  → `save_summary` → return text. `lib.rs` — `mod ai` + register command.

**Frontend:**
- `types/domain.ts` — `summary?`/`summaryModel?`/`summarizedAt?`. `lib/ipc.ts` — `summarizeSession(id)`.
- `SessionDetailRoute.tsx` — `summarizing` state, `doSummarize()`, **"Ringkasan AI"** section (empty-state +
  finish button / summary view + regenerate) + `SummaryView` (lightweight Markdown renderer, no deps).
- `main.css` — summary styling.

## Verification
- `bun run build` — OK (76 modules). `cargo check` — OK. `cargo clippy` — clean (2 pre-existing in mixer).
- Runtime (real OpenAI call) not tested headless — needs GUI + key + a recorded session.

## Follow-ups
- Auto-summarize on stop; "summarized" badge in sidebar; model selector in settings; map-reduce for very long
  transcripts (currently a hard 60k char cut).
