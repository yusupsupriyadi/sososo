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

## Follow-up: playback flicker ("ngeblink") + A/V lag — research & fix

Next test report: the saved MP4 itself (same in VLC + Windows player, so it's the recording not the
in-app player) **flickers/tears** and audio **lags** the video.

Researched the established best practice (MS _Screen capture to video_ tutorial + **SimpleRecorder**
sample; `Direct3D11CaptureFramePool.CreateFreeThreaded` docs; `windows-capture` & `windows-record`
repos). Findings:

- **Root cause of flicker:** the canonical MS recorder copies each captured frame into a fresh
  composition texture _on demand_ before encoding, so the capture pool can't overwrite a surface
  mid-encode. `windows-capture` 2.0.0 instead creates the frame pool with **1 buffer** and sends the
  surface to an **async** transcode thread with no safe copy → the pool recycles the surface before
  it's encoded → torn/flickering frames. Choppy video against continuous audio reads as "audio telat".
- **`windows-record` alternative** rejected: v0.1.0, Desktop-Duplication (whole-monitor, crops to the
  window → breaks when occluded/minimized), and "robust audio sync" is still an open TODO.

Fixes shipped:

- **Cap capture to 30 fps** (`MinimumUpdateInterval` + encoder `frame_rate(30)`) — doubles the
  encoder's per-frame headroom and halves load (`src/video/windows.rs`).
- **Vendored `windows-capture` 2.0.0** into `src-tauri/vendor/windows-capture` and **patched the frame
  pool from 1 → 3 buffers** (`Create` + `Recreate` in `src/graphics_capture_api.rs`, marked
  "LOCAL PATCH"), matching MS double/triple-buffering guidance so a sent surface stays valid for
  several frames. `Cargo.toml` now uses `windows-capture = { path = "vendor/windows-capture" }`.
- Verified: `cargo check`/`clippy`/`test` (34) green with the vendored crate. Manual re-test pending.
- If a residual constant A/V offset remains after flicker is gone, next step is AAC priming-delay
  compensation; widen-skew or per-frame copy in `build_padded_surface` if odd-sized windows still tear.

### Update: 3 buffers wasn't enough — per-frame copy was the real fix

Re-test: **audio now fine** (A/V sync resolved), but video **still tore** — user described it as
"splitting / black / broken-TV", the textbook signature of an encoder reading a recycled GPU surface.
So more frame-pool buffers alone didn't help. Patched the vendored encoder to match Microsoft's
reference exactly: `VideoEncoder::build_padded_surface` now allocates a **fresh target texture per
frame** (kept alive by the returned surface ref until the encoder consumes it) instead of reusing one
cached texture, and `send_frame` **always copies** rather than handing the capture pool's own surface
to the async transcoder. Removes the recycle race for any window size / encoder speed.
(`src-tauri/vendor/windows-capture/src/encoder.rs`, "LOCAL PATCH".) Verified `cargo build`/`clippy`/
`test` green; manual re-test pending.
