# Single window + transcription view (Pause & Finish), remove overlay

- **Date:** 2026-06-06

## Problem & request
1. **Bug:** the floating overlay transcription window, once closed, could not be reopened (destroyed, no recreate).
2. **UX change:** make it **one window** — on start it becomes the transcription view, with **Pause** and
   **Finish** on top.

## Solution
Remove the overlay entirely (fixing the bug) and make the app **single-window, state-driven**: during an active
session the window shows `RecordingView` (live transcript + Pause/Finish bar); when idle, the normal layout
(titlebar + history sidebar + library/settings/detail routes).

**Backend:**
- **Pause** (`session.rs`/`state.rs`/`commands.rs`): `ActiveSession` holds `paused: Arc<AtomicBool>`; the bridge
  checks it each tick — when paused, samples are dropped and **not** sent to Deepgram (WS kept alive via SDK
  `.keep_alive()`); resume forwards again. New command `set_paused(bool)`.
- **Remove overlay** (`lib.rs`): no overlay window in `setup()`; drop `focus_overlay`; clean unused imports.
  Delete `capabilities/overlay.json`.

**Frontend:**
- **Delete** `src/windows/overlay/` (OverlayApp, RecBar, LiveCaptions, QuickNoteInput, overlay.css).
- `AppRouter.tsx` — only `/main/*`. `MainApp.tsx` — conditional render: in-session → full `RecordingView`;
  else normal layout. On `stopped`, navigate to session detail if a final transcript exists, else home.
- `RecordingView.tsx` *(new)* — top bar (status + timer + Pause/Resume + Finish) + live captions (auto-scroll).
- `sessionStore.ts` — add `paused`/`pausedAt`/`pausedTotalMs` + `setPaused` (pause-time accounting).
  `useElapsedTimer.ts` — exclude paused time. `useSession.ts` — `togglePause` (optimistic + revert on fail).
  `useTranscriptStream.ts` — reset pause accounting per session. `ipc.ts` — `setPaused` (replaces `focusOverlay`).
  `LibraryRoute.tsx` — drop overlay branch. `main.css` — `RecordingView` + caption styles (ported from overlay).

**Docs:** `CLAUDE.md` — architecture rewritten to "One window, state-driven views"; roadmap D & E done.

## Notes
- `window-vibrancy` remains in `Cargo.lock` as a **transitive** `tauri` dep — not used by our code, so still no blur.
- Pause uses Deepgram keep-alive, so long pauses keep the connection alive.

## Verification
- `bun run build` — OK (72 modules; 4 overlay files removed). `cargo check` — OK. `cargo clippy` — clean
  (2 pre-existing in mixer). Runtime/visual not tested headless.
