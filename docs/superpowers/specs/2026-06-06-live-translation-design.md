# Live Translation (OpenAI) — Design Spec

- Date: 2026-06-06
- Status: Approved
- Scope: Add live, per-segment translation to the live-transcription view using OpenAI. The
  translation renders **below** the original line (never overwrites it) and is **persisted** so it
  also shows in the session-detail/history view. Translated segments are **never re-translated**.

## Goal

While recording, each finalized transcript line is translated (via OpenAI) into a user-chosen target
language and shown under the original text. Target language defaults to **English**, is selectable on
the Start screen, and the feature is toggled from both the Start screen and the recording pill.

## Decisions (from brainstorming)

- **Target language:** "Translate to" dropdown on the Start screen (full list minus `multi`), default `en`.
- **Activation:** toggle on Start screen + quick on/off button in the recording pill.
- **Persistence:** stored in SQLite and shown in session detail.
- **Granularity:** only `isFinal` segments, cached per-segment (no re-translation).
- **Orchestration:** Frontend-orchestrated command (mirrors `summarize_session`). FE watches final
  segments and calls a `translate_segment` command; backend calls OpenAI, writes the DB, returns text.

## Anti-duplication (core requirement) — 3 layers

1. Only `isFinal` segments are translated (interim results ignored).
2. FE cache keyed by `segmentId`: skip if a translation already exists for the same `forText` + `lang`.
3. Backend command is idempotent: if the row already has a translation for the same lang, return it
   without calling OpenAI.

## Data flow

```
final segment -> transcriptStore
  useLiveTranslation (FE): translateEnabled? translation exists for (segmentId,text,lang)?
    yes -> SKIP
    no  -> mark 'pending' (synchronous, prevents double-fire)
             invoke translate_segment(sessionId, segmentId, text, targetLang)
               Rust: ai::translate (OpenAI gpt-4o-mini) -> db.save_translation -> return text
             store 'done' -> render below original line
```

## Backend (Rust)

- `ai.rs` — `pub async fn translate(api_key, text, target_language) -> AppResult<String>`. Reuses the
  existing `ChatResponse`/`Choice`/`ChatMessage`/`ApiErrorEnvelope` structs. Model `gpt-4o-mini`,
  temperature 0.2, 30s timeout. Prompt: translate into `target_language`, output ONLY the translation;
  if already in that language, return unchanged.
- `db.rs` — add columns `translation TEXT`, `translation_lang TEXT` to `segments` (+ `migrate()` for
  existing DBs). `StoredSegment` gains `translation: Option<String>` and `translation_lang:
Option<String>`. `get_session` selects them. New methods `save_translation(session_id, segment_id,
translation, lang)` and `get_translation(session_id, segment_id) -> Option<(String, String)>`.
- `commands.rs` — `translate_segment(db, session_id, segment_id, text, target_lang) -> AppResult<String>`:
  check OpenAI key; if `get_translation` already has the same lang, return it; else `ai::translate`,
  `save_translation`, return text. DB mutex never held across the network await (matches
  `summarize_session`).
- `lib.rs` — register `translate_segment` in `invoke_handler!`.

## Frontend (TS)

- `types/domain.ts` — `StoredSegment` gains `translation?: string | null`, `translationLang?: string | null`.
- `lib/ipc.ts` — `translateSegment(sessionId, segmentId, text, targetLang): Promise<string>`.
- `lib/languages.ts` — `TRANSLATE_TARGETS` = `LANGUAGES` without `multi`.
- `state/configStore.ts` — add `translateEnabled: boolean` (default `false`) and `targetLanguage:
string` (default `"en"`) + setters; persist both (extend `partialize`).
- `state/transcriptStore.ts` — add `translations: Record<string, TranslationEntry>` and
  `setTranslation(segmentId, entry)`; `reset()` clears it too. `TranslationEntry = { status:
'pending' | 'done' | 'error'; text?: string; forText: string; lang: string }`.
- `hooks/useLiveTranslation.ts` (new) — orchestrator. For each final, non-empty segment, when
  `translateEnabled` and no valid cached translation and not pending: synchronously mark pending, then
  invoke `translateSegment`, then store done/error. Called once from `RecordingView`.

## UI

- **Start screen** (`LibraryRoute`): "Live translate (OpenAI)" toggle; when on, show "Translate to"
  dropdown (`TRANSLATE_TARGETS`, default English). Small hint if the OpenAI key is missing
  (via `hasApiKey('openai')`).
- **Pill** (`RecordingView`): icon toggle button for quick on/off while recording (flips
  `configStore.translateEnabled`).
- **Transcript line** (live + history): translation rendered below the original — dim color + thin
  accent left-border, font scaled by `transcriptScale`. `pending` -> faint "Translating…"; `error` ->
  silent/faint. Never overwrites the original.

## Verification

- Rust: `cargo check` + `cargo clippy` (from `src-tauri/`).
- Frontend: `bun run build` (tsc strict + vite).
- Manual: start a session, confirm translations appear below finalized lines, toggling works, and
  re-rendered/updated segments are not re-translated; open the session in history and confirm the
  stored translations show.

## Out of scope (YAGNI)

- Streaming token-by-token translation; batching multiple segments per request; translating interim
  results; translating already-stored historical sessions retroactively; per-line manual re-translate.
