# Security Policy

## Supported versions

`sososo` is in early development (`0.x`). Security fixes are applied to the
latest release and the `master` branch only.

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| older   | ❌        |

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately through one of:

- GitHub: **Security → Report a vulnerability** (private advisory) on this
  repository.
- Email: **yusup@hamasmart.com**

Please include:

- A description of the issue and its impact.
- Steps to reproduce (proof of concept if possible).
- Affected version / commit.

You can expect an acknowledgement within a few days. Once fixed, we will
publish an advisory and credit you unless you prefer to remain anonymous.

## Good to know

- **API keys** (Deepgram, OpenAI) are stored in the **Windows Credential
  Manager** via the `keyring` crate. They are never written to the repository,
  config files, or logs, and are never returned to the frontend — only a
  boolean "is a key set?" is exposed.
- The app has **no backend and no telemetry**. Audio and transcripts only go to
  the third-party services you configure (see [PRIVACY.md](./PRIVACY.md)).
- The app's network surface is limited by a Content-Security-Policy and the
  Tauri capability allowlist (`src-tauri/capabilities/`).

Thank you for helping keep users safe.
