# Privacy

`sososo` is a local desktop app with **no backend, no account, and no
telemetry**. The maintainers never receive your audio, transcripts, or keys.
However, the app's core function is to send audio to third-party transcription
and AI services that **you** configure. This document explains exactly what
leaves your machine.

## What leaves your machine

| Data               | Destination       | When                                                 |
| ------------------ | ----------------- | ---------------------------------------------------- |
| Live audio (PCM)   | Deepgram          | While recording (streamed over WSS)                  |
| Transcript text    | OpenAI            | Only when you request an AI summary                  |
| API keys (as auth) | Deepgram / OpenAI | Sent only as authorization headers to those services |

- **Audio → Deepgram.** Microphone + system (loopback) audio is streamed to
  Deepgram's live speech-to-text WebSocket for transcription. See Deepgram's
  [privacy policy](https://deepgram.com/privacy).
- **Transcript → OpenAI.** If you trigger a summary, the session transcript is
  sent to the OpenAI API. See OpenAI's
  [privacy policy](https://openai.com/policies/privacy-policy).

## What stays on your machine

- **API keys** — stored in the Windows Credential Manager (encrypted by the
  OS), never in the repo or plaintext config.
- **Transcripts & sessions** — persisted in a local SQLite database on your
  device. Nothing is uploaded except as described above.
- **No analytics or crash reporting** are collected.

## Your responsibilities

- **Consent to record.** Recording calls/meetings may be regulated where you
  live. Make sure you have the consent of other participants and comply with
  local laws.
- **Third-party terms.** Your use of Deepgram and OpenAI is governed by their
  respective terms and privacy policies.

## Questions

Open an issue or email **yusup@hamasmart.com**.
