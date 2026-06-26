# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.1] - 2026-06-26

### Added

- **"OpenAI Compatible" AI provider for any custom endpoint.** A new provider
  option that accepts an arbitrary **base URL + your own API key**, so any
  third-party gateway speaking the OpenAI Chat Completions wire format —
  **OpenRouter**, **Qwen**, and similar — can drive the AI session summary, live
  translation, and transcript chat. Unlike the fixed cloud presets it takes a
  configurable Base URL (defaults to OpenRouter at
  `https://openrouter.ai/api/v1`); unlike the local-Llama option it requires a
  real API key, stored in the OS keychain. Pick it in **Settings → API Keys**,
  where a **Base URL** field appears alongside the key and model, with common
  OpenRouter model suggestions. (Resolves [#10]; thanks @dinoudon.)

### Security

- **Bumped `quinn-proto` to 0.11.15** to resolve **RUSTSEC-2026-0185** (high,
  CVSS 7.5 — remote memory exhaustion from unbounded out-of-order QUIC stream
  reassembly) in a transitive dependency. Lockfile-only change; no application
  code is affected.

### Internal

- **CI security audit hardened.** `bun audit` now ignores the low-severity,
  dev-server-only esbuild advisory **GHSA-g7r4-m6w7-qqqr** (pulled in
  transitively by vite, whose `^0.27.0` esbuild constraint cannot reach the
  patched `>=0.28.1`, and the shipped Tauri app never runs the vite dev server);
  `cargo audit` passes on the patched `quinn-proto`. Both gates still fail on any
  other advisory.

## [0.9.0] - 2026-06-17

### Added

- **Choose your AI provider — beyond OpenAI & Gemini.** The AI session summary,
  live translation, and transcript chat now run on a provider of your choice.
  Added **Anthropic (Claude)**, **GLM (Zhipu AI)**, **Kimi (Moonshot)**, **Grok
  (xAI)**, **DeepSeek**, and **local Llama** — the last via any OpenAI-compatible
  local server (**Ollama**, **LM Studio**, **llama.cpp**), so models like Llama
  or Qwen can run fully on your machine with no cloud key. Each cloud provider
  stores its own API key in the OS keychain; the active provider is picked in
  **Settings → API Keys**. (Resolves [#10].)
- **Per-provider model selection.** Every provider has its own configurable
  **model** — a free-text field with common suggestions — defaulting to a
  fast/cheap tier (OpenAI `gpt-4o-mini`, Gemini `gemini-2.5-flash`, Claude
  `claude-haiku-4-5`, GLM `glm-4.6`, Kimi `kimi-k2.5`, Grok `grok-4`, DeepSeek
  `deepseek-chat`, Ollama `llama3.1`). For local Llama you also set the server
  base URL (defaults to Ollama at `http://localhost:11434/v1`).
- **System tray with close-to-tray.** sososo now lives in the system tray: a
  tray icon with an **Open / Quit** menu (left-click reopens the window). By
  default, **closing the window hides the app to the tray instead of
  quitting**, so an active recording keeps running in the background — the X
  no longer kills a meeting transcription. Quitting from the tray during a
  recording finishes the session cleanly first. The behavior can be turned off
  in the new **Settings → Behavior** section (then closing quits, as before).
- **Global shortcut to start/stop recording** — `Ctrl+Alt+R` (`Ctrl+Cmd+R` on
  macOS) works while **any** app has focus, even with sososo hidden in the
  tray: it starts a recording when idle and finishes the running one (presses
  during startup/shutdown are ignored, so it can never double-start). When a
  press starts a session, the window is brought forward so the recording
  widget is visible. If another app already owns the combo (screen recorders
  like to claim it), sososo falls back to `Ctrl+Alt+Shift+R` — Settings →
  Behavior always shows the combo that's actually active, or a warning when
  both are taken. Can be disabled there too, which releases the keys back to
  other apps.
- **Meeting auto-detection (Windows).** While idle, sososo checks your open
  windows every few seconds for an active **Zoom, Microsoft Teams, Google
  Meet, or Webex** meeting (native apps and browser tabs). When one appears, a
  banner offers one-click **Start recording**, plus a system notification when
  the app is unfocused or in the tray. Dismissing — or recording — the meeting
  snoozes the prompt until that meeting ends, so it never nags about the same
  one twice. Idle Zoom/Teams windows don't trigger it; matching happens
  locally on window titles only (nothing leaves your device). On-by-default
  toggle in Settings → Behavior.

### Changed

- **Streamlined AI settings.** Settings → API Keys now puts the AI-provider
  dropdown first and shows **only the selected provider's fields** — its API key
  (or the base URL for local Llama) plus the model — instead of listing every
  provider's key input at once.
- **Visual window picker for video recording (Windows).** The Start screen's
  "Record video of a window" selector is no longer a plain dropdown of window
  titles: choosing now opens a Zoom-style dialog showing a **live thumbnail of
  every open window** with its app name and title, plus search and refresh.
  The picked window stays visible on the Start screen as a small preview card
  with a **Change** button, turning the toggle on goes straight to the picker,
  and a closed window is flagged with a "no longer open" warning. Windows that
  can't be previewed (minimized or protected) show a placeholder card; the
  app's own window is no longer listed. On macOS the new picker UI appears
  without thumbnails yet. Capture is per window (browser tabs can't be listed
  or recorded from outside the browser), so when a browser is open the dialog
  shows a "Recording a single browser tab?" banner: drag the tab out into its
  own window — the list refreshes itself when you come back to the app, so the
  new window is already there to pick.

## [0.8.0] - 2026-06-10

### Added

- **Video recording of a meeting window (Windows & macOS).** A session can now
  also record a chosen application window — a Zoom window, a browser meeting
  tab, any app — to an **MP4 saved with the session**, so a recording produces
  both a transcript _and_ a video. Enable **"Record video of a window"** on the
  Start screen and pick the window from the list (with a refresh button); the
  existing Start/Pause/Finish controls drive audio transcription and video
  together, and a **REC** badge shows in the recording widget while video is on.
- **Video audio follows the capture mode.** In **Meeting** mode the MP4's audio
  track is your microphone mixed with the system audio (use headphones — on
  speakers the mic re-records the system sound); in **System only** mode the
  video records system audio alone (no mic), so videos/music aren't doubled.
- **Playback in the session detail.** Sessions with a recording show a built-in
  video player above the AI summary (served via Tauri's asset protocol). The
  MP4 lives in the app data folder under `recordings/` and the saved path is
  stored with the session; a session that recorded video is kept even if it
  produced no transcript lines.
- **Live transcription loading & transitional states.** The recording widget now
  shows meaningful connecting/listening/finishing states instead of a blank
  panel while the Deepgram session spins up or winds down.
- Licensing & IP-protection docs: `LICENSING.md`, `COMMERCIAL-LICENSE.md`
  (commercial-terms outline), `TRADEMARK.md` (the "sososo" name/logo are
  reserved marks — forks must rebrand), `CLA.md` (Contributor License Agreement,
  required so the project can keep dual-licensing), plus `NOTICE` and `AUTHORS`.
- `SPDX-License-Identifier: AGPL-3.0-only` headers on source files, and a CLA /
  DCO `Signed-off-by` requirement in `CONTRIBUTING.md`.

### Changed

- **Relicensed from MIT to GNU AGPL-3.0, and the project is now dual-licensed.**
  The community edition is AGPL-3.0 (copyleft — distributing or hosting a
  modified version requires releasing the corresponding source); a separate
  **commercial license** is available for proprietary use without the AGPL
  obligations. See `LICENSING.md` and `COMMERCIAL-LICENSE.md`. This change is not
  retroactive — code already published under MIT remains available under MIT.
- **macOS now requires macOS 12.3 or newer** (was 11.0): the app links Apple's
  ScreenCaptureKit framework for video recording. Recording itself needs
  **macOS 15+** (ScreenCaptureKit direct-to-file + microphone capture) and the
  **Screen Recording** permission; on older systems the rest of the app —
  transcription, summaries, history — keeps working and video recording reports
  a clear error. macOS video recording has not yet been verified on hardware
  (it compiles and passes CI); treat it as **experimental** in this release.

### Platform / implementation notes

- **Windows capture quality:** recording uses Windows.Graphics.Capture with a
  vendored, locally patched `windows-capture` — the capture frame pool now has
  3 buffers and every frame is copied to a fresh GPU texture before encoding,
  eliminating the flicker/tearing ("broken TV" frames) of the stock encoder;
  capture is capped at 30 fps and encodes H.264 + AAC via Media Foundation.
- **Audio mixing (Windows):** the video's 48 kHz mic+system mix only pairs
  available samples and silence-pads beyond ~100 ms of clock drift, fixing the
  crackle that naive per-frame padding caused; sums saturate instead of
  wrapping. The 16 kHz Deepgram transcription pipeline is untouched.
- **macOS:** ScreenCaptureKit `SCRecordingOutput` records straight to MP4 (the
  OS encodes and muxes); the app binary now embeds the Swift-runtime rpaths it
  needs to load, and CI/release select the latest stable Xcode for the Swift
  bridge.
- Linux video recording is **not** included in this release (the capture stack
  there — xdg-desktop-portal + PipeWire — is a separate effort); the video
  controls are hidden on Linux and audio transcription is unaffected.

### Internal

- New cfg-gated `src-tauri/src/video/` module (Windows / macOS / stub), DB
  migration adding `sessions.video_path`, `list_windows` / `set_video_options`
  commands, and CI that now compiles and tests all three OS backends (with an
  extra Intel-macOS check for the universal build).

## [0.7.1] - 2026-06-07

### Changed

- **Start screen: "Audio source" is now an icon toggle instead of a dropdown.**
  The capture mode is chosen with two clearly-labeled icon buttons —
  **Meeting** (system audio + microphone) and **System only** (video / music) —
  so picking a mode is a single tap and the active choice is visible at a glance.
  The microphone and system-audio device pickers stay as dropdowns (their lists
  are dynamic). The Start form is a little wider to fit the new layout.

### Added

- **Language accuracy tip on the Start screen.** A short hint under the Language
  selector notes that picking a specific language (e.g. English) is more accurate
  than Auto-detect.

### Internal

- The release workflow no longer attaches the standalone `.sig` updater-signature
  files as release assets — the signature is already inlined in `latest.json` (the
  only thing the in-app updater reads at runtime), so the loose `.sig` files were
  just clutter on the downloads page. Auto-update is unaffected.

## [0.7.0] - 2026-06-07

### Added

- **Ask about this transcript (per-session AI chat).** Every saved session now
  has a chat where you can ask the active AI provider (OpenAI or Gemini) questions
  about that transcript — e.g. "What were the main decisions?" or "What did each
  speaker focus on?". The conversation is persisted per session, so it is still
  there when you reopen the recording, and can be cleared at any time.
- **Collapsible "Ask" sidebar.** On the session-detail (transcription result)
  page the chat lives in its own right-hand sidebar card, beside the history
  sidebar and the transcript/summary — a three-column layout. It collapses to a
  thin vertical **"Ask"** strip to give the transcript more room, and the
  collapsed/expanded choice is remembered between sessions and app restarts.

### Changed

- The session-detail page is now a three-column shell (history · transcript &
  summary · chat). The chat is a real sibling column that the content reflows
  around, replacing the old inline "Ask about this transcript" section in the
  middle of the page.

### Internal

- **Test-Driven Development foundation.** Added Rust (`cargo test`) and frontend
  (`bun test`) suites covering Zustand stores, language/error/`db` logic, and
  `lib/` helpers; TDD is now the required workflow for new features and fixes.
- **Stronger CI.** Quality gates enforce the test suites + ESLint on every change,
  with added `dependency-audit` and `commit-lint` jobs.
- **Codebase decomposition.** Split the large `commands.rs`, `db.rs`, and `ai.rs`
  into focused per-domain modules, and extracted session-detail
  (markdown/highlight/speakers) and settings (styles / AppearanceSection) helpers.
- The Windows updater now prefers the NSIS artifact; `CLAUDE.md` is no longer
  tracked in git.

## [0.6.0] - 2026-06-07

### Added

- **In-app auto-update.** The app now checks GitHub Releases for new versions
  (silently at launch and on demand in Settings → App update), then downloads,
  installs, and restarts from within the app — no manual installer download
  needed. Built on the Tauri updater plugin with signed update artifacts.

> Auto-update takes effect from this release onward: updating _to_ 0.6.0 is a
> one-time manual download (0.5.0 predates the updater); from 0.6.0 onward,
> updates install in-app.

## [0.5.0] - 2026-06-07

### Added

- **Rich Markdown in AI summaries** — session summaries now render formatted
  Markdown (headings, lists, bold, links) instead of plain text.
- **Session detail: summary-language selector + transcript translation** — pick
  the AI-summary language and translate a saved transcript directly from the
  session view.

### Fixed

- Corrected the contact email across the Code of Conduct, Privacy, and Security
  documents.

## [0.4.0] - 2026-06-07

### Added

- **Linux support.** The app now builds and runs on Linux (PulseAudio or
  PipeWire). System audio is captured automatically from the default output's
  **monitor** source — no virtual device or routing needed (unlike macOS), the
  same zero-setup experience as Windows. Captured via `libpulse`, which converts
  to the 16 kHz/16-bit/mono transcription format server-side. API keys are stored
  in the Secret Service (GNOME Keyring / KWallet). Release artifacts: `.deb` /
  `.AppImage` / `.rpm`.

### Changed

- CI and the release workflow now build on Linux (`ubuntu-latest`) in addition to
  Windows and macOS.

## [0.3.1] - 2026-06-07

### Changed

- Documentation: the README now documents **Google Gemini** as a selectable AI
  provider alongside OpenAI (for both session summaries and live translation),
  with provider-selection and key-setup steps and a Google AI Studio key link.
  Added a developer/architecture reference under `docs/`.

> No application code changed since 0.3.0 — Gemini support shipped in 0.3.0; this
> release brings the user-facing docs in line with it.

## [0.3.0] - 2026-06-06

### Added

- **macOS support (experimental / alpha).** The app now builds and runs on
  macOS 11+. System audio is captured via cpal/CoreAudio using a virtual device
  such as BlackHole (see the README setup), with native traffic-light window
  controls. The macOS build is published as **"sososo Alpha"** while it is
  validated on real hardware; the Windows build is unchanged.
- Gemini as a selectable AI provider alongside OpenAI, for session summaries and
  live translation (Settings → Active AI provider).
- Settings: a Deepgram API-key help link and a note about the $200 of free
  credit for new accounts.

### Fixed

- The start-transcription screen now scrolls when its content is taller than the
  window (e.g. with live-translate expanded or a larger UI scale).

## [0.2.0] - 2026-06-06

### Added

- About page: app overview, version, a link to the GitHub repository, and a
  request to star the project.
- Configurable AI summary output language, persisted across sessions.
- Rename speaker labels from a session's history (applied across the session).
- Adjustable background transparency for the glass UI (Settings → Appearance).

### Changed

- New brand identity: the sososo bullseye app icon (window, taskbar, and
  installer) plus the wordmark logo in the titlebar; README and favicon updated
  to match.

## [0.1.0] - 2026-06-06

First public release. **Windows only** — macOS and Linux are not yet tested.

### Added

- WASAPI system-audio + microphone capture, mixed into diarized channels
  ("you" / "remote").
- Deepgram live speech-to-text with interim and finalized captions
  (Nova-3 for multilingual/English, Nova-2 otherwise).
- Live translation of the transcript to a chosen target language via OpenAI.
- Transparent "liquid glass" UI with a compact, always-on-top recording widget
  (pause / finish).
- SQLite session persistence with library and history views.
- AI session summaries via OpenAI.
- Bring-your-own-key settings (Deepgram, OpenAI) stored in the Windows
  Credential Manager.
- Open-source project setup: MIT license, README, SECURITY/PRIVACY policies,
  CONTRIBUTING, Code of Conduct, and issue/PR templates.
- Formatting SOP — Prettier (with Tailwind class sorting) + rustfmt, enforced by
  a Husky pre-commit hook — plus CI and a Windows release workflow.

[unreleased]: https://github.com/yusupsupriyadi/sososo/compare/v0.9.1...HEAD
[0.9.1]: https://github.com/yusupsupriyadi/sososo/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/yusupsupriyadi/sososo/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/yusupsupriyadi/sososo/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/yusupsupriyadi/sososo/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/yusupsupriyadi/sososo/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/yusupsupriyadi/sososo/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/yusupsupriyadi/sososo/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/yusupsupriyadi/sososo/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/yusupsupriyadi/sososo/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/yusupsupriyadi/sososo/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/yusupsupriyadi/sososo/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/yusupsupriyadi/sososo/releases/tag/v0.1.0
[#10]: https://github.com/yusupsupriyadi/sososo/issues/10
