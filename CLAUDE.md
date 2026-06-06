# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`sososo` is a Windows desktop app for **real-time meeting/audio transcription**. It captures system
audio (WASAPI loopback) + microphone, streams both to Deepgram for live speech-to-text, and shows
live captions in a single transparent-glass window that switches to a full transcription view (with
pause/finish) while recording, plus a library/settings/history UI when idle. User-facing UI copy is
in **English** (the app was switched from Bahasa Indonesia to English).

Stack: Tauri 2 (Rust) backend · React 19 + React Router 7 + Zustand 5 + Vite 7 + Tailwind CSS v4
(TypeScript) frontend · **Bun** package manager.

## Commands

Run from the repo root. The package manager is **Bun** — do not use npm/yarn/pnpm.

| Task | Command |
|------|---------|
| Run the full desktop app (dev) | `bun run tauri dev` |
| Frontend only (browser, no Tauri APIs) | `bun run dev` → http://localhost:1420 |
| Typecheck + build frontend | `bun run build` (runs `tsc` then `vite build`) |
| Build the installer/bundle | `bun run tauri build` |
| Rust check / lint (from `src-tauri/`) | `cargo check` · `cargo clippy` |
| Audio capture smoke test (from `src-tauri/`) | `cargo run --example audio_probe -- 6` |

- **No unit-test framework is configured.** Verification = `bun run build` (TS), `cargo check` /
  `cargo clippy` (Rust), and the `audio_probe` example (writes `audio_probe.wav` — L=mic, R=system —
  and prints per-channel RMS to confirm both channels carry audio).
- TypeScript is **strict** with `noUnusedLocals` / `noUnusedParameters`: unused vars/params fail the build.
- `cargo` is installed via rustup at `~/.cargo/bin`; `bun run tauri *` invokes it for you.

## Architecture

### One window, state-driven views
A single Vite build serves the one window (`AppRouter.tsx` via `HashRouter`, `index.html#/main` →
`windows/main/MainApp`). The **main** window is the only window (declared in `tauri.conf.json`);
there is no separate overlay window anymore.

`MainApp` is **session-state-driven**: while a session is active (`starting`/`recording`/`stopping`)
it renders `RecordingView` as a **compact, always-on-top floating widget** — a small pill with two icon
buttons (**yellow = pause/resume, red = finish**) above the live-transcript panel. `RecordingView`
shrinks the window via `enterRecordingWindow` on mount and restores it via `exitRecordingWindow` on
unmount (`lib/window.ts`; needs the `set-size`/`center`/`set-always-on-top` window capabilities and a
small `minWidth`/`minHeight` in `tauri.conf.json`). Otherwise `MainApp` renders the normal layout
(titlebar + session sidebar + library/settings/session-detail routes). When a session ends it
navigates to the session detail (where the AI summary lives) if anything was transcribed, else home.

Transparent glass (**no backdrop blur**) = `transparent:true` + `decorations:false` window with **no**
native acrylic/vibrancy; the desktop behind shows through sharply. Styling is **Tailwind CSS v4**
(`@tailwindcss/vite`, no config file) and **utility-first**: all component styling is inline utility
classes in JSX. The single `src/styles/app.css` holds only `@import "tailwindcss"`, the `@theme` design
tokens (colors, radii, `--font-sans`, `--shadow-liquid`, `--animate-rec-pulse`), the `rec-pulse`
`@keyframes`, one custom `@utility liquid-glass`, and an `@layer base` reset (transparent bg, fonts,
scrollbar, dark `<option>`, drag-region cursor). There is no `@layer components`.

The **"liquid glass"** look is glossy, not frosted (CSS-only, no window blur). `@utility liquid-glass`
(panels, sidebar, titlebar, pill, recording panel) = translucent `--color-glass` fill + bright white
edge + inset top highlight + layered depth shadow + a diagonal specular sheen drawn by `::before`/
`::after` at `z-index:-1` (so it never washes out text). Buttons get the glossy edge via the
`shadow-liquid` utility + brighter white borders. Exact non-scale values use arbitrary utilities
(`text-[13px]`, `bg-[rgba(110,168,254,0.2)]`).

### Audio → STT pipeline (the core data flow)
`commands::start_session` → `session::spawn_session` → async `run_session` (Tauri/tokio runtime):
1. **Capture** (`audio/capture.rs`): mic and system-loopback each run on a dedicated thread in an
   **MTA COM apartment**, using WASAPI **polling** mode with `autoconvert` to emit 16 kHz / 16-bit /
   mono PCM. Bounded crossbeam channels (cap 64) **drop on lag** to favor fresh audio over latency.
2. **Mix** (`audio/mixer.rs` `Interleaver`): interleaves mic (channel 0 = "you") + system
   (channel 1 = "remote") into one 2-channel stream, silence-padding the starved channel to bound
   clock drift between the two independent WASAPI clocks. `system_only` mode skips the mic → mono.
3. **Bridge**: a tokio task ticks every 40 ms, drains the crossbeam receivers, and forwards
   interleaved little-endian bytes into a `futures::mpsc` stream.
4. **Stream**: Deepgram live WS (`Nova-3` for `multi`/`en`, `Nova-2` for other languages) with
   diarization, smart-format, and interim results. Each `TranscriptResponse` becomes a
   `transcript://segment` event.

Stop is cooperative via a `tokio_util::CancellationToken`; teardown joins the bridge and stops both captures.

### IPC & events
- **Commands** (frontend → backend): registered in `lib.rs` `invoke_handler!`; Rust impls in
  `commands.rs`; typed TS wrappers in `lib/ipc.ts`. Tauri auto-maps **camelCase JS ↔ snake_case Rust**.
  `AppError` (`error.rs`) serializes to a plain string so commands can `?`-return it to the UI.
- **Events** (backend → frontend): `events.rs` emits `session://state` and `transcript://segment`
  **globally**; `lib/events.ts` + the `useTranscriptStream` hook subscribe globally in each window.
  Mount `useTranscriptStream` **once per window**.
- Live transcript: each segment has a stable `segmentId` (`{session}:{channel}:{start}`); the frontend
  **upserts by id** so interim results are replaced in place when finalized (`state/transcriptStore.ts`).

### State
- **Rust** (`state.rs` `AppState`, Mutex-guarded, Tauri-managed): active session (id + cancel token),
  selected input/output device ids, language, `system_only`.
- **Frontend** (Zustand): `sessionStore` (state machine: idle→starting→recording→stopping→stopped/error),
  `transcriptStore` (segments), `configStore` (language, systemOnly).

### Secrets & permissions
- API keys (`deepgram`, `openai`) live in the **Windows Credential Manager** via `keyring` (`keys.rs`).
  They are **never** returned to the frontend — only `has_api_key` (a boolean) is exposed.
- The window capability in `src-tauri/capabilities/main.json` grants the minimal window permissions
  (start-dragging, minimize, close); CSP is set in `tauri.conf.json`.

## Conventions & gotchas
- **English** for all user-facing UI strings (and for code, identifiers, and commit messages). The AI
  summary (OpenAI) is also generated in English.
- **WASAPI needs MTA**: Tauri command worker threads may be STA, so `list_devices` enumerates on a
  freshly spawned thread. Any new WASAPI work must run on a thread that called `initialize_mta()`.
- **Loopback requires polling mode** (the WASAPI loopback flag is incompatible with event callbacks);
  the mic uses polling too so there is a single capture code path.
- Window helpers in `lib/window.ts` guard against running outside a Tauri webview (plain `vite dev`),
  so handlers no-op instead of throwing.
- **Milestone roadmap**: A = UI shell, B = audio capture, C = live STT + session, **D = persistence
  (SQLite, `db.rs`)**, **E = AI summary (OpenAI, `ai.rs` + `summarize_session`)** — all implemented.
  See `.development-history/` for per-feature notes.

## Development history (project rule)
Document every work activity as a Markdown report in the **`.development-history/`** folder (create it
if it does not exist). This folder doubles as the project knowledge base and additional documentation.
**Write these reports in English and keep them as compact as possible** — prefer terse bullet points over
prose, and capture only what is needed to understand the change (goal, key changes, decisions, verification).
