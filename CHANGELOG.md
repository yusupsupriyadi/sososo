# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Open-sourced the project: MIT license, full README, `SECURITY.md`,
  `PRIVACY.md`, `CONTRIBUTING.md`, Code of Conduct, and issue/PR templates.
- Formatting SOP — Prettier (with Tailwind class sorting) for web files and
  `rustfmt` for Rust, enforced by a Husky pre-commit hook.
- CI workflow (Prettier/rustfmt checks + frontend build + clippy) and a release
  workflow that builds the Windows installer via `tauri-action`.

## 0.1.0 — first public release (upcoming)

### Added

- WASAPI system-audio + microphone capture, mixed into diarized channels
  ("you" / "remote").
- Deepgram live speech-to-text with interim and finalized captions
  (Nova-3 for multilingual/English, Nova-2 otherwise).
- Transparent "liquid glass" UI with a compact, always-on-top recording widget
  (pause / finish).
- SQLite session persistence with library and history views.
- AI session summaries via OpenAI.
- Bring-your-own-key settings (Deepgram, OpenAI) stored in the Windows
  Credential Manager.

[unreleased]: https://github.com/yusupsupriyadi/sososo/commits/master
