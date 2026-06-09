# Video recording — macOS (ScreenCaptureKit)

**Goal:** Extend the window video-recording feature (already working on Windows) to **macOS**, reusing
the same session/DB/UI plumbing. Linux remains out of scope for now (much larger: portal + PipeWire,
different UX).

## Approach

macOS is simpler than Windows: Apple's **ScreenCaptureKit** records straight to an MP4 with system
audio + microphone via `SCRecordingOutput` — the framework encodes + muxes, so there is **no** manual
frame pump, encoder, or audio mixer (the Windows pain points don't exist here). Uses the
[`screencapturekit`](https://crates.io/crates/screencapturekit) crate v7 (`macos_15_0` feature →
`SCRecordingOutput` + microphone).

Flow (`src/video/macos.rs`): `SCShareableContent::get()` → list/find window → `SCContentFilter` for the
window → `SCStreamConfiguration` (`captures_audio`, `captures_microphone` unless system-only, 48 kHz
stereo) → `SCRecordingOutput` (H.264 / MP4) → `SCStream::add_recording_output` + `start_capture`; stop
= `remove_recording_output` + `stop_capture`.

The `SCStream` is created + driven on a **dedicated thread** (ScreenCaptureKit objects aren't `Send`);
the public `VideoRecorder` only carries a stop channel + join handle + path, so the session task stays
`Send` (same handle contract as the Windows backend → no changes to `session.rs`).

## Key changes

- `src-tauri/Cargo.toml`: `screencapturekit = { version = "7", features = ["macos_15_0"] }` (macOS target).
- `src-tauri/src/video/mod.rs`: cfg-gate `macos` → `macos.rs`; non-Windows-non-macOS → `unsupported.rs`.
- `src-tauri/src/video/macos.rs`: new backend (`list_windows`, `start_window_recording`, `VideoRecorder`).
- `src-tauri/Info.plist`: add `NSScreenCaptureUsageDescription` (mic description already present).
- `src/windows/main/routes/LibraryRoute.tsx`: show the video toggle/picker on macOS too
  (`VIDEO_SUPPORTED = !isLinux`).

## Requirements / notes

- Runtime: macOS **14+** for `SCRecordingOutput`, **15+** for microphone capture; **Screen Recording**
  permission (System Settings → Privacy & Security). First capture triggers the TCC prompt.
- The audio device dropdowns on the Start screen still drive the **Deepgram** path (cpal); ScreenCaptureKit
  uses the system default devices for the video's audio track.

## Verification status

- Windows build unaffected: `cargo check` (Windows) + `bun run build` green (macОS module is cfg-gated
  out, so it is **not** compiled on the Windows dev machine).
- **macOS code is an un-compiled first draft** — it could not be built/tested on the Windows dev machine
  (needs the macOS SDK + hardware). Uncertain API points are marked `// VERIFY ON MAC` in `macos.rs`
  (single-window `SCContentFilter` builder method, `SCWindow` accessors, `window.frame()` sizing, stop
  order). Next step: `cargo check` / `bun run tauri dev` on a Mac and fix any compile deltas.

## Pending

- **Linux**: not started — needs xdg-desktop-portal (ScreenCast) + PipeWire (Wayland/X11), with a
  portal-driven window picker (different UX) and GStreamer/ffmpeg encoding. Tracked as a separate, larger
  effort.
