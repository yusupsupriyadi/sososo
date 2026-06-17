# Multi AI provider support (Anthropic, GLM, Kimi, Grok, DeepSeek)

**Date:** 2026-06-17
**Goal:** Add more AI provider options in Settings beyond OpenAI/Gemini.

## What changed

Extended the AI backend (summaries + live translation + transcript chat) from 2
providers to 7: **OpenAI, Gemini, Anthropic, GLM (Zhipu), Kimi (Moonshot), Grok
(xAI), DeepSeek**. Each provider gets its own keychain entry + an API-key input
in Settings, and the active-provider dropdown now lists all 7.

## Key decisions

- **Transport reuse.** GLM, Kimi, Grok, DeepSeek all speak the OpenAI Chat
  Completions wire format → they share the existing `openai` transport,
  parameterized by `(endpoint, model, label)` via a new `OpenAiBackend` struct.
  Only the base URL + model differ (see `Provider::openai_compatible`).
- **Anthropic** has a distinct request/response shape (top-level `system`,
  required `max_tokens`, `x-api-key` + `anthropic-version` headers, `content[]`
  blocks) → new `ai/anthropic.rs` transport, mirroring `ai/gemini.rs`.
- **Default models** (cheap/fast tier, matching `gpt-4o-mini` / `gemini-2.5-flash`),
  kept as easily-bumped constants: GLM `glm-4.6`, Kimi `kimi-k2.5`, Grok `grok-4`,
  DeepSeek `deepseek-chat`, Anthropic `claude-haiku-4-5`.
- **Provider parsing split:** `from_setting` stays lenient (unknown → OpenAI) for
  reads; new `try_from_setting` is strict (unknown → None) so `set_ai_provider`
  rejects bad input. `id()` is the single canonical lowercase string used as both
  the persisted setting and the keychain service name.
- **Frontend is data-driven.** New `lib/aiProviders.ts` (`AI_PROVIDERS`) is the
  single source for the Settings AI-key list + provider dropdown (id, label,
  placeholder, keys URL) — replaces the previous hardcoded OpenAI/Gemini inputs.

## Files

- `src-tauri/src/ai/provider.rs`: 7-variant `Provider`; `try_from_setting`, `id`,
  `openai_compatible`; expanded unit tests.
- `src-tauri/src/ai/openai.rs`: `OpenAiBackend` struct; transport now takes
  endpoint/model/label (was hardcoded OpenAI).
- `src-tauri/src/ai/anthropic.rs`: **new** Messages API transport.
- `src-tauri/src/ai/mod.rs`: `mod anthropic`; `chat` + `chat_about_transcript`
  dispatch (OpenAI-compatible early-return, then Gemini/Anthropic arms).
- `src-tauri/src/commands/assistant.rs`: `set_ai_provider` accepts all 7 via
  `try_from_setting`.
- `src/types/domain.ts`: `AiProvider` union extended; `ApiService = 'deepgram' | AiProvider`.
- `src/lib/aiProviders.ts` (+ `.test.ts`): **new** provider metadata + tests.
- `src/windows/main/routes/SettingsRoute.tsx`: per-provider key inputs + dropdown
  rendered from `AI_PROVIDERS`; `aiKeys`/`aiSaved` records replace per-key state.
- `src/lib/ipc.ts`: doc-comment touch-ups.

## Verification

- `cargo clippy --all-targets`: clean (0 warnings).
- `cargo test` (manifest): 57 passed; `cargo test --lib ai::`: 9 passed
  (TDD red→green on the provider parsing/dispatch logic).
- `bun run build` (tsc strict + vite): success.
- `bun test`: 79 passed (incl. the new `aiProviders.test.ts`).
- Live API round-trips per new provider are I/O-bound — verify by running the app
  with a real key for the selected provider.
