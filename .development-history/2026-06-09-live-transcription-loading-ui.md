# Live transcription: meaningful loading / transitional UI

**Goal:** Make the live transcription widget's loading states (the "Connecting to Deepgram…"
placeholder and every other waiting state) feel alive and informative instead of static italic text.

## Backstory

- The only feedback while a session spun up was a centered, static, faint italic line:
  `Connecting to Deepgram…` (during `starting`) or `Live transcript will appear here…` (otherwise).
- The header status dot was a dead gray dot during `starting`/`stopping` — looked frozen.
- `Translating…` and `Finishing…` had no motion either.
- Backend reality (`session.rs`): the only real transitions are `starting → recording` (audio capture
  up + Deepgram WS open) and the eventual teardown. So a two-phase **Connecting → Listening** loader is
  an honest mirror of the actual lifecycle, not a faked progress bar.

## Changes

- **`src/windows/main/recordingStatus.ts`** (new, pure + unit-tested): `sessionStatusLabel(state,
paused)` (`starting`→"Connecting…", `stopping`→"Finishing…", `reconnecting`→"Reconnecting…", pause
  wins only over running states) and `liveBodyState(state, segmentCount)` → which body to render
  (`connecting`/`listening`/`reconnecting`/`finishing`/`transcript`). Any captured segment always wins
  → transcript is never hidden behind a loader, not even mid-teardown.
- **`src/windows/main/LiveStatusViews.tsx`** (new, presentational): `ConnectingState` (audio glyph with
  pinging accent rings + staggered dots; `variant="reconnecting"` swaps to amber), `ListeningState`
  (out-of-phase equalizer bars + "Waiting for audio — start talking…"), `FinishingState` (spinner +
  "Saving your transcript."), plus reusable `LoadingDots`/`EqualizerBars`. Decorative parts are
  `aria-hidden`; each block is `role="status" aria-live="polite"` so the status is announced.
- **`src/windows/main/RecordingView.tsx`**: status label now from `sessionStatusLabel`; header dot
  animates per state (`starting`→`animate-pulse bg-accent`, `stopping`/`reconnecting`/`error`→pulsing
  amber, live→`rec-pulse`, paused→solid gray); body switches on `liveBodyState`; `Translating…` →
  "Translating" + animated `LoadingDots` (amber).
- **`src/styles/app.css`**: added `@theme` tokens + `@keyframes` for `eq-bar` and `loading-dot`
  (`animate-eq-bar`, `animate-loading-dot`); added a `prefers-reduced-motion: reduce` guard that holds
  the new loaders (and `rec-pulse`) steady. Built-in `animate-ping`/`animate-spin`/`animate-pulse` reused.

## Decisions

- Honest two-phase loader keyed off the real `starting → recording` transition (no fake sub-steps; the
  backend emits no finer granularity).
- Pure decision logic split out and TDD-tested; the visual components are verified by `bun run build`
  - running the app (no happy-dom/RTL in the repo, per the project's TDD pragmatics).
- `reconnecting` is wired through (label + amber dot + `ConnectingState variant`) even though the
  backend never emits it yet — cheap, and ready if/when reconnection lands.

## Verification

- `recordingStatus.test.ts`: red (missing module) → green (5 tests, label + body-state matrix).
- `bun test` = 38 pass / 0 fail. `bun run build` (tsc strict + vite) = clean.
- `bun run lint` = 0 errors (only pre-existing warnings in `SessionDetailRoute.tsx`).
- `prettier --check` on all changed files = clean.
- Grepped the production CSS bundle: `@keyframes eq-bar`/`loading-dot`, the `animate-*` utilities, and
  the `prefers-reduced-motion` block are all emitted.
- Frontend-only change — no Rust touched, so `cargo`/`audio_probe` gates N/A. Live audio + Deepgram
  round-trip still needs the manual `bun run tauri dev` runtime check.
