# Settings: show only the active AI provider's config

**Date:** 2026-06-17
**Goal:** The AI section listed an API-key input for all 7 cloud providers at
once — too much. Show only the selected provider's fields.

## What changed (UI/UX only)

Reworked the "AI summaries & translation" block:

- **Provider dropdown moved to the top** (you pick first).
- Below it, a single **config card shows only the selected provider's fields**:
  - Cloud provider → its API key input (+ saved badge + "Get a key" link) and a
    model field.
  - Local Llama → base URL + model (no key), with the Ollama hint.
- Removed the 7-up list of always-visible key inputs.

Unified the model state: one `model` value for the active provider (loaded via
`getAiModel` for every provider, including Llama) — dropped the separate
`llamaModel` state. The card's model "Save" calls `setAiModel` for cloud and
`setLlamaConfig` (base URL + model) for Llama.

No backend changes — reuses the existing `get/set_ai_model` and
`get/set_llama_config` commands.

## Files

- `src/windows/main/routes/SettingsRoute.tsx`: dropdown-first layout; active
  provider config card; unified `model` state; accuracy tweak to the
  auto-summarize hint.

## Verification

- `bun run build` (tsc strict): success. `bun test`: 82 passed.
- Switching the provider dropdown swaps the shown key/base-URL + model; only the
  active provider's fields render.
