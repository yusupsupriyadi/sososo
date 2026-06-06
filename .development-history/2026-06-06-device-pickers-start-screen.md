# Feature: device pickers on the Start-transcription screen

**Goal:** Add Microphone + System-audio (speaker) device selection to the
Start-transcription screen, which previously only had Language + Audio source.
Mirror the existing Settings pickers and keep both screens in sync.

## Decisions (from brainstorming)

- **Sync** → device selection is shared via the config store and **auto-applies**
  to the backend on change (no Save button on the start screen), so it stays in
  sync with Settings.
- **Mic visibility** → the Microphone picker stays always active regardless of
  the System-only mode (simplest; backend already ignores the mic in that mode).

## Key changes

- `state/configStore.ts`: `inputDevice` / `outputDevice` (`string | null`,
  default `null` = system default) with `setInputDevice` / `setOutputDevice`.
  **Not** persisted (`partialize` still only keeps the appearance scales) —
  device ids aren't stable across restarts and are synced to the backend anyway.
- `routes/LibraryRoute.tsx`: load `listDevices()` once, seed defaults only if the
  store value is still `null` (don't clobber a Settings choice); two new `<select>`
  controls ("Microphone", "System audio (speaker to capture)"); effect calls
  `setDevices(inputDevice, outputDevice)` on change (mirrors the existing
  `setTranscriptionOptions` effect).
- `routes/SettingsRoute.tsx`: migrated local `inputId`/`outputId` state to the
  shared store; "Save devices" button now reads the store. Behavior unchanged.

## Notes / coordination

- Backend untouched — `list_devices` / `set_devices` (AppState `input_device`/
  `output_device`) already existed and are read at session start.
- `configStore.ts` edits were swept into a parallel commit (multi-agent repo);
  the UI side shipped in `feat(devices): add mic & system-audio pickers...`.

## Verification

- `bun run build` (tsc strict + vite build) — passes.
