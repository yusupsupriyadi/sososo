# Live Translation (OpenAI) — live transcription

Goal: translate each finalized transcript line via OpenAI, shown **below** the original (never
overwriting), persisted to history, and never re-translated. Spec:
`docs/superpowers/specs/2026-06-06-live-translation-design.md`.

## Decisions

- Target language: "Translate to" dropdown on the Start screen, default English.
- Activation: toggle on Start screen + quick globe button in the recording pill.
- Granularity: only `isFinal` segments; cached per-segment.
- Orchestration: frontend-orchestrated command (mirrors `summarize_session`).

## Key changes

Backend (Rust):

- `ai.rs` — `translate(api_key, text, target_language)`; reuses the summary OpenAI structs/endpoint,
  `gpt-4o-mini`, temp 0.2, 30s timeout, "output only the translation" prompt.
- `db.rs` — `segments` gains `translation` + `translation_lang` (schema + `migrate()` for old DBs);
  `StoredSegment` gains both; `get_session` selects them; new `save_translation` / `get_translation`.
- `commands.rs` — `translate_segment(session_id, segment_id, text, target_lang)`: idempotent (returns
  the stored translation if the lang matches), else OpenAI → persist → return. DB mutex never held
  across the network await.
- `lib.rs` — registered `translate_segment`.

Frontend (TS):

- `configStore` — `translateEnabled` (default off) + `targetLanguage` (default `en`), both persisted.
- `transcriptStore` — `translations: Record<segmentId, TranslationEntry>` + `setTranslation`; reset
  clears it.
- `hooks/useLiveTranslation.ts` (new) — watches final segments; marks pending synchronously
  (anti double-fire), calls `translateSegment`, stores done/error; skips already-translated lines and
  ignores stale responses.
- `lib/ipc.ts` — `translateSegment` wrapper. `lib/languages.ts` — `TRANSLATE_TARGETS` (no `multi`).
- `types/domain.ts` — `StoredSegment` gains `translation` / `translationLang`.
- `RecordingView.tsx` — globe toggle button in the pill + `TranslationLine` rendered under each line.
- `LibraryRoute.tsx` — "Live translate (OpenAI)" toggle + "Translate to" dropdown + OpenAI-key hint.
- `SessionDetailRoute.tsx` — renders stored translations under each line in history.

## Anti-duplication (3 layers)

1. Only `isFinal` segments translated. 2. FE cache per `segmentId` (skip if `forText` + `lang` match).
2. Backend command idempotent per (segment, lang).

## Verification

- `bun run build` — OK (tsc strict + vite). `cargo clippy` — OK (only pre-existing `mixer.rs`
  warnings, out of scope).
- Manual: not run here (needs Deepgram + OpenAI keys and live audio).
