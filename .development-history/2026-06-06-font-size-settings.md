# Feature: UI & transcript font-size settings

**Goal:** Let users adjust (1) overall UI font size and (2) transcript +
speaker-label font size from the Settings page.

## Decisions (from brainstorming)

- **UI font** → scale the whole UI via CSS `zoom` (styling is fixed-px, so a
  root font-size change wouldn't cascade). Applied at the document root so `vh`
  layouts still fit; reset to 100% while the floating recording widget is active.
- **Control** → percent sliders (live % label) rather than presets.
- **Transcript font** → one multiplier scaling both the transcript text and the
  speaker label together, in **both** live recording and saved history.

## Key changes

- `state/configStore.ts`: `uiScale` + `transcriptScale` (default 1) with setters,
  wrapped in zustand `persist` (localStorage `sososo-config`, `partialize` to the
  two scale fields). Exported `UI_SCALE_MIN/MAX`, `TRANSCRIPT_SCALE_MIN/MAX`.
- `routes/SettingsRoute.tsx`: new **Appearance** section — two range sliders +
  live % + a transcript preview line.
- `MainApp.tsx`: effect sets `document.documentElement.style.zoom = uiScale`
  (or `1` while in-session); cleanup resets to `1`.
- `RecordingView.tsx` + `routes/SessionDetailRoute.tsx`: transcript text (base
  14px) and speaker label (base 11px) use inline `fontSize: base * transcriptScale`.

## Notes / coordination

- Shipped during the live Bahasa-Indonesia → English UI migration, so all new
  copy is in English (new project convention). New strings: "Appearance",
  "UI font size", "Transcript font size".
- Persistence: only appearance prefs are persisted; `language`/`systemOnly`
  remain in-memory (synced to the backend separately).

## Verification

- `bun run build` (tsc strict + vite build) — passes.
