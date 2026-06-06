# Recording view: compact floating widget (yellow/red pill)

- **Date:** 2026-06-06

## Request

Per the user's mockup: on start, a **simpler** view — a **floating pill with just 2 icon buttons** (**yellow =
pause**, **red = finish**) above a large transcript panel.

## Solution

`RecordingView` changes from a full-window bar to a **compact floating widget**:

- On start, the window shrinks to **460×600** + **always-on-top** + re-center (`enterRecordingWindow`), no
  titlebar. On end, it restores **1040×720** + center + non-always-on-top (`exitRecordingWindow`), then opens
  the session detail.
- **Pill** with **only 2 icon buttons**: Pause/Resume — rounded **yellow** square (`#f5c518`), SVG pause/play;
  Finish — **red** circle (`var(--rec)`), SVG stop. SVG icons (`fill: currentColor`), not emoji.
- **Glass transcript panel** below (transparent gap shows the desktop) with a subtle header (status dot + timer)
  - auto-scroll captions. Pill & header are `data-tauri-drag-region` (draggable).

## Changes

- `tauri.conf.json` — `minWidth/minHeight` lowered to `380/420`. `capabilities/main.json` — add
  `core:window:allow-set-size`/`allow-center`/`allow-set-always-on-top`.
- `src/lib/window.ts` — `enterRecordingWindow()` / `exitRecordingWindow()` (`setSize`/`center`/`setAlwaysOnTop`).
- `RecordingView.tsx` — redesign pill + panel + SVG icons + shrink/restore on mount/unmount.
- `MainApp.tsx` — in-session renders **only** `RecordingView` (no titlebar/sidebar). `main.css` — `.recording-root`,
  `.rec-pill`, `.rec-pause` (yellow), `.rec-end` (red), `.rec-panel`, etc. `CLAUDE.md` — architecture updated.

## Autonomous decisions (adjustable)

- Widget **460×600** + always-on-top while recording (mimics the old floating overlay). Timer/status kept but
  subtle in the panel header, not on the pill (pill is 2 buttons only).

## Follow-up: true floating + drag handle

- **Float, not a box:** the native **window shadow** drew a soft rectangle around the
  whole transparent area (visible as the ~15-22px halo in the screenshot), so the
  pill/panel read as one boxed unit. Fixed by setting **`shadow: false` permanently
  in `tauri.conf.json`** (applied at window creation — a runtime `setShadow(false)`
  was unreliable). No window shadow anywhere now; the pill and glass panel float as
  separate shapes, each keeping its own CSS box-shadow.
- **Drag handle:** added a grip-dots handle in the pill, **to the right of the red
  finish button**, as the dedicated `data-tauri-drag-region` to move the window.
  Removed the drag-region from the pill container (the panel header stays draggable
  as a bonus). The handle's SVG is `pointer-events: none` so mousedown targets the
  handle and the drag region fires.

## Verification

- `bun run build` — OK (72 modules). `cargo check` — OK (capability + conf validated by tauri-build).
  Visual/runtime not tested headless.
