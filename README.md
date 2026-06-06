# sososo

> Real-time meeting & audio transcription for Windows — live captions from your
> system audio **and** microphone, with AI summaries.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![CI](https://github.com/yusupsupriyadi/sososo/actions/workflows/ci.yml/badge.svg)](https://github.com/yusupsupriyadi/sososo/actions/workflows/ci.yml)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB.svg)](https://tauri.app)

`sososo` captures what you hear (system audio via WASAPI loopback) and what you
say (microphone), streams both to [Deepgram](https://deepgram.com) for live
speech-to-text, and shows captions in a translucent "liquid glass" window. When
a session ends it can generate an AI summary via [OpenAI](https://openai.com).

It is a **bring-your-own-key** app: you use your own Deepgram and OpenAI API
keys, stored securely in the Windows Credential Manager. There is no backend,
no account, and no telemetry.

> [!IMPORTANT]
> **Platform:** Windows 10/11 only. Audio capture relies on Windows WASAPI, so
> the app does not function on macOS or Linux.

<!-- TODO: add a screenshot / GIF of the glass window + live transcript here. -->

## Features

- 🎙️ **Dual capture** — system audio (loopback) + microphone, mixed into two
  diarized channels ("you" vs. "remote").
- ⚡ **Live captions** — interim + finalized transcript segments streamed in
  real time.
- 🌐 **Many languages** — Deepgram Nova-3 (multilingual / English) and Nova-2
  (other languages), with diarization and smart formatting.
- 🪟 **Compact recording widget** — a small always-on-top pill (pause / finish)
  while recording; full library, history, and settings views when idle.
- 🧠 **AI summaries** — optional end-of-session summary generated with OpenAI.
- 🔒 **Private by design** — keys in the OS Credential Manager; no server, no
  telemetry. (See [PRIVACY.md](./PRIVACY.md) for what leaves your machine.)

## Privacy at a glance

This app sends audio and text to third-party services **you** configure:

- **Audio → Deepgram** over a secure WebSocket for transcription.
- **Transcript → OpenAI** (only if you trigger a summary).

Your API keys never leave your machine except as auth headers to those
services, and are stored in the Windows Credential Manager — never in the repo
or in plaintext config. Full details in [PRIVACY.md](./PRIVACY.md).

## Install

### Download a release (recommended)

Grab the latest Windows installer from the
[Releases page](https://github.com/yusupsupriyadi/sososo/releases).

> [!NOTE]
> Builds are not yet code-signed, so Windows SmartScreen may warn on first run
> ("More info" → "Run anyway"). Signed builds are planned.

### Build from source

**Prerequisites**

- [Bun](https://bun.sh) (package manager — do not use npm/yarn/pnpm)
- [Rust](https://rustup.rs) (stable toolchain)
- Windows 10/11 with [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)
  (preinstalled on current Windows)

```sh
bun install
bun run tauri dev     # run the desktop app in development
bun run tauri build   # produce an installer in src-tauri/target/release/bundle
```

## Configure your API keys

1. Launch the app and open **Settings**.
2. Paste your **Deepgram** API key (required for transcription) and, optionally,
   your **OpenAI** API key (for summaries).
3. Keys are saved to the Windows Credential Manager. The app only ever checks
   _whether_ a key exists — it never reads keys back into the UI.

Get keys from the [Deepgram console](https://console.deepgram.com) and the
[OpenAI dashboard](https://platform.openai.com/api-keys).

## Development

The package manager is **Bun**.

| Task                        | Command                                                  |
| --------------------------- | -------------------------------------------------------- |
| Run the desktop app (dev)   | `bun run tauri dev`                                      |
| Frontend only (browser)     | `bun run dev` → http://localhost:1420                    |
| Typecheck + build frontend  | `bun run build`                                          |
| Format (Prettier + rustfmt) | `bun run format` · `bun run fmt:rust`                    |
| Format check                | `bun run format:check` · `bun run fmt:rust:check`        |
| Rust check / lint           | `cargo check` · `cargo clippy` (in `src-tauri/`)         |
| Audio capture smoke test    | `cargo run --example audio_probe -- 6` (in `src-tauri/`) |

Formatting is enforced by a Husky pre-commit hook (lint-staged runs Prettier on
web files and rustfmt on Rust). See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Tech stack

- **Backend:** Tauri 2 (Rust) — WASAPI capture, Deepgram WS streaming, SQLite
  persistence, OpenAI summaries.
- **Frontend:** React 19 · React Router 7 · Zustand 5 · Vite 7 · Tailwind CSS v4
  (TypeScript).

Architecture notes and per-feature history live in
[`.development-history/`](./.development-history) and `CLAUDE.md`.

## Contributing

Contributions are welcome — please read [CONTRIBUTING.md](./CONTRIBUTING.md) and
our [Code of Conduct](./CODE_OF_CONDUCT.md). To report a security issue, see
[SECURITY.md](./SECURITY.md).

## License

Released under the [MIT License](./LICENSE). © 2026 Yusup Supriyadi.
