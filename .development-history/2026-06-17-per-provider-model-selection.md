# Per-provider model selection

**Date:** 2026-06-17
**Goal:** Let the user choose which model each AI provider uses (previously one
hardcoded model per provider).

## What changed

Every provider now has a **model field** in Settings. Each provider's model is
persisted independently (`ai_model:<id>`); when unset it falls back to the
provider's built-in default. The field is **free-text with a `<datalist>` of
common suggestions** per provider — so any model the provider accepts works, and
the suggestion list never blocks newer/unknown models (model lineups churn fast).

UI: the model field is shown for the **active** provider (under the provider
dropdown). For local Llama it lives in the existing Llama block alongside the
base URL.

## Key decisions

- **Free-text + datalist, not a fixed dropdown.** Model names change constantly
  (we already saw `deepseek-chat` heading for deprecation, GLM/Grok/Kimi version
  bumps). A free-text field future-proofs; datalist gives discoverability.
- **Unified storage `ai_model:<id>` for all 8 providers** (including Llama, which
  drops its separate `llama_model` key — only `llama_base_url` stays
  Llama-specific). `Provider::default_model()` is the single source for defaults
  (delegating to `openai_compatible` for the cloud OpenAI-compatible five).
- **Model threaded through the transports.** `gemini`/`anthropic` transports now
  take a `model: &str` param (their hardcoded `*_MODEL` constants are gone); the
  `Backend::{Gemini,Anthropic}` variants carry `model`. `chat()` returns the
  actual model used for all backends.

## Files

- `src-tauri/src/ai/provider.rs`: `default_model()` (+ test).
- `src-tauri/src/ai/gemini.rs` / `anthropic.rs`: `model` param; removed
  `GEMINI_MODEL` / `ANTHROPIC_MODEL` constants.
- `src-tauri/src/ai/mod.rs`: `Backend::Gemini`/`Anthropic` carry `model`;
  dispatch passes it through and returns it.
- `src-tauri/src/commands/assistant.rs`: `ai_model_key` + `resolve_model`
  helpers; `get_ai_model`/`set_ai_model` commands; `resolve_backend` and
  `get/set_llama_config` use the unified model key.
- `src-tauri/src/lib.rs`: register `get_ai_model`/`set_ai_model`.
- `src/lib/aiProviders.ts` (+ `.test.ts`): `MODEL_SUGGESTIONS` per provider.
- `src/lib/ipc.ts`: `getAiModel`/`setAiModel`.
- `src/windows/main/routes/SettingsRoute.tsx`: model field (datalist) for the
  active provider; datalist added to the Llama model input.

## Verification

- `cargo clippy --all-targets`: clean. `cargo test`: 60 passed (TDD red→green on
  `default_model`).
- `bun run build`: success. `bun test`: 82 passed (incl. new `MODEL_SUGGESTIONS`
  test).
- Live calls per model are I/O-bound — verify by selecting a provider, changing
  the model, and running a summary/chat.
