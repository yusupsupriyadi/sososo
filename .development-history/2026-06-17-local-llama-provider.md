# Local Llama AI provider (Ollama / LM Studio / llama.cpp)

**Date:** 2026-06-17
**Goal:** Add a local Llama option to the AI provider list (follow-up to the
multi-provider work earlier today).

## What changed

Added an 8th provider, **Llama (local)** (`llama`), that talks to a local
OpenAI-compatible server (Ollama by default, also LM Studio / llama.cpp). Unlike
the cloud providers it needs **no API key**; instead the **base URL + model** are
user-configurable in Settings (defaults point at Ollama).

## Key decisions

- **No static endpoint.** Local config is runtime, so `LlamaLocal` is NOT in the
  static `Provider::openai_compatible` table — its `(endpoint, model)` come from
  DB settings (`llama_base_url`, `llama_model`).
- **Resolved-`Backend` refactor.** Introduced `ai::Backend` (an enum:
  `OpenAiCompatible { endpoint, model, label, api_key }` / `Gemini` /
  `Anthropic`) built once by the command layer (`resolve_backend`, which has DB +
  keychain access). The `ai::{summarize,translate,chat_about_transcript,chat}`
  functions now take `&Backend` instead of `(Provider, &key)`. This is what lets
  the local endpoint/model (owned `String`s) flow through the same OpenAI
  transport as the cloud constants — `OpenAiBackend` became lifetime-generic
  (`&'a str`) to borrow either.
- **No keychain entry for Llama.** A placeholder bearer token (`"local"`) is sent
  (Ollama/LM Studio/llama.cpp ignore it; an empty one is rejected by some).
- **URL normalization.** `llama_chat_url(base)` appends `/chat/completions`
  unless already present (tolerates trailing slash / whitespace), so users enter
  just the base (`http://localhost:11434/v1`).
- **Frontend split.** `AI_PROVIDERS` stays the 7 keyed cloud providers (key
  inputs); new `PROVIDER_OPTIONS` (= cloud + `LLAMA_LOCAL`) drives the dropdown.
  A local-Llama config block (base URL + model) shows only when Llama is active.

## Files

- `src-tauri/src/ai/provider.rs`: `LlamaLocal` variant; `LLAMA_DEFAULT_BASE_URL`/
  `LLAMA_DEFAULT_MODEL`/`LLAMA_PLACEHOLDER_KEY`; `llama_chat_url`; tests.
- `src-tauri/src/ai/mod.rs`: `Backend` enum; `chat`/`summarize`/`translate`/
  `chat_about_transcript` take `&Backend`.
- `src-tauri/src/ai/openai.rs`: `OpenAiBackend<'a>` (borrowed strings).
- `src-tauri/src/commands/assistant.rs`: `resolve_backend`; `LlamaConfig` +
  `get_llama_config`/`set_llama_config` commands.
- `src-tauri/src/lib.rs`: register the two new commands.
- `src/types/domain.ts`: `AiProvider` adds `'llama'`; new `LlamaConfig`.
- `src/lib/aiProviders.ts` (+ `.test.ts`): `LLAMA_LOCAL`, `PROVIDER_OPTIONS`.
- `src/lib/ipc.ts`: `getLlamaConfig`/`setLlamaConfig`.
- `src/windows/main/routes/SettingsRoute.tsx`: dropdown from `PROVIDER_OPTIONS`;
  conditional local-Llama config block.

## Verification

- `cargo clippy --all-targets`: clean. `cargo test`: 59 passed (TDD red→green on
  `LlamaLocal` parsing + `llama_chat_url`).
- `bun run build`: success. `bun test`: 81 passed (incl. new `PROVIDER_OPTIONS`
  tests).
- End-to-end needs a running local server — verify with
  `ollama serve` + `ollama pull llama3.1`, select "Llama (local)" in Settings.
