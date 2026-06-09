# Video recording of an app window (Windows)

**Goal:** Let a session also record a chosen application window (e.g. Zoom, a browser meeting tab)
to an MP4 saved with the session — so `sososo` produces a transcript _and_ a video, not just audio
transcription. Windows-only for this first iteration; macOS/Linux compile but report "unsupported"
and the UI hides the controls.

## Scope (confirmed with user)

- Source: a specific **application window** picked from a list (not full-screen).
- Audio in the file: **mixed mic + system audio**, muxed into the MP4 (complete meeting recording).
- Trigger: **integrated with the session** — a "Record video" toggle + window picker on the Start
  screen; the existing Start/Finish controls drive audio-transcription _and_ video together.

## Key changes

### Backend (`src-tauri/`)

- Dep: `windows-capture = "2"` (Windows target) — Graphics Capture + Media Foundation H.264/AAC
  encoder. Enabled `tauri` feature `protocol-asset` (required by `assetProtocol` in the config).
- New `src/video/` module (mirrors `audio/`):
  - `mixer.rs` — `VideoAudioMixer`: sums mic (48 kHz stereo) + system (48 kHz stereo) into one
    interleaved stereo stream, silence-padding the starved side (loopback delivers nothing during
    silence) and saturating to avoid `i16` wrap. Pure + unit-tested (TDD).
  - `windows.rs` — `list_windows()` (`Window::enumerate`), two 48 kHz/stereo WASAPI polling captures
    (mic + loopback, same shape as `audio/capture/windows.rs`), a `GraphicsCaptureApiHandler` that
    builds the encoder lazily from the first frame's size (even-aligned for H.264) and feeds
    `send_frame` + drained/mixed `send_audio_buffer` per frame, and a `VideoRecorder` whose `stop()`
    finalizes the MP4 (the encoder's `Drop` flushes the transcoder when the handler drops).
  - `unsupported.rs` — non-Windows stubs (empty window list + "unsupported" error).
- `error.rs`: `AppError::Video`.
- `state.rs`: `AppState.video_enabled` + `video_window`.
- Commands: `list_windows` (on a dedicated thread, like `list_devices`) + `set_video_options`.
- Session lifecycle: `start_session` builds a `VideoStartConfig` (output path
  `app_data/recordings/{id}.mp4`, reusing the selected mic/output devices) when video is enabled +
  a window is chosen; `run_session` starts the recorder once capture is live (best-effort — a video
  failure logs but never blocks transcription) and, on teardown, stops it via `spawn_blocking`,
  persists the path **before** `finalize_session`.
- DB: `sessions.video_path` column (schema + migration); `set_video_path`; `finalize_session` now
  **keeps** a row that has a video even with zero transcript segments (so a video-only recording
  isn't discarded). New `SessionSummary.video_path`. TDD covers both.
- `tauri.conf.json`: `assetProtocol` enabled, scope `$APPDATA/recordings/*`, CSP gains
  `media-src`/`connect-src` for `asset:`/`http://asset.localhost` (local MP4 playback).

### Frontend (`src/`)

- `configStore`: `videoEnabled` (persisted) + `videoWindowId` (in-memory — HWNDs are per-run).
- Start screen (`LibraryRoute`): Windows-only "Record video of a window" toggle + window-picker
  `<select>` (`listWindows` + refresh), synced to the backend via `setVideoOptions`.
- Session detail: a `<video controls>` player (via `convertFileSrc`) when `session.videoPath` is set.
- `RecordingView`: a small "REC" video indicator in the status row while recording.
- `lib/ipc.ts` + `types/domain.ts`: `listWindows`, `setVideoOptions`, `WindowInfo`, `videoPath`.

## Verification

- `cargo test` (34, incl. new mixer + DB tests), `cargo clippy`, `cargo check` — green.
- `bun run build` (tsc strict + vite), `bun test` (33) — green.
- `audio_probe` example compiles (audio path untouched).
- **Pending manual runtime** (needs the GUI): `bun run tauri dev` → enable Record video, pick a
  window, record ~30 s, Finish → confirm the session detail shows a playable MP4 with video + mixed
  audio and the transcript is intact. A/V sync and the static-window audio-underrun edge case should
  be eyeballed there (audio is fed per video frame; refine with a keep-alive pull if drift appears).

## Notes

- Two extra 48 kHz WASAPI capture clients run alongside the existing 16 kHz ones (4 total); the
  16 kHz/mono Deepgram path is untouched, so transcription quality is unaffected.
- Branch: `feat/video-recording-windows`.

## Follow-up: audio fixes (after first manual test)

First test showed the recorded MP4 audio was **doubled** and **crackling** (recorded in System-only
mode). Root causes + fixes:

- **Crackle (confirmed):** `VideoAudioMixer` forced both 48 kHz streams to equal length every video
  frame, splicing silence on the normal inter-stream WASAPI clock jitter (~30–60 splices/sec).
  Rewrote it to mirror `audio::mixer::Interleaver`: pair-and-sum only `min(mic, system)` per drain,
  keep the remainder, and silence-pad a side only past `max_skew` (~100 ms). Whole-stereo-frame
  aligned (no L/R desync); saturating sum. 7 unit tests updated.
- **Double:** the mixer can't duplicate content — the same audio was in both mic and system. In
  System-only mode the video was still mixing the mic, so on speakers the mic re-captured the system
  audio (heard twice) and the doubled signal clipped. Fix: `VideoStartConfig.system_only` now skips
  the mic capture entirely in System-only mode → video track = system audio only. (Meeting mode still
  mixes mic + system; use headphones to avoid acoustic echo.)
- Verified: `cargo test` (34, incl. rewritten mixer tests), `cargo clippy` green. Manual re-test
  pending (rebuild via `bun run tauri dev`).
