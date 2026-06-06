# UI: liquid-glass look (glossy, no blur)

- **Date:** 2026-06-06

## Goal

User wants a "liquid glass" look, referencing a concrete example (translucent fill +
bright white border + `inset 0 1px 0 rgba(255,255,255,.75)` highlight + layered
soft shadows + diagonal `before/after` white gradient sheen + `backdrop-blur-sm`).

## Decision on blur

The example's `backdrop-blur-sm` frosts the image _behind_ the control. In this app
the window is `transparent:true` with no acrylic, so `backdrop-filter` cannot reach
the desktop behind a panel (it only blurs in-app backdrop, which is empty) → no
visible frost. So blur was **omitted** (also consistent with the earlier "no blur"
request); the liquid-glass look is carried entirely by the highlight + bright edge +
layered shadow + diagonal sheen. (Real desktop frost would require re-adding native
acrylic — offered, not done.)

## Implementation (utility-first preserved)

- `src/styles/app.css`:
  - Replaced `--shadow-glass`/`--shadow-pill` tokens with **`--shadow-liquid`**
    (`inset 0 1px 0 rgb(255 255 255/.6), 0 0 9px …, 0 3px 8px …`) → `shadow-liquid`
    utility for glossy button edges.
  - Added custom **`@utility liquid-glass`**: `position:relative; isolation:isolate`,
    translucent `--color-glass` fill, `1px` white/35 border, inset top highlight +
    layered depth shadow, and `::before`/`::after` diagonal specular gradients at
    `z-index:-1` (sheen sits above the fill but **below content**, so text isn't
    washed). Pair with a `rounded-*` utility.
- Applied `liquid-glass` to: content panel (`MainApp`), sidebar (`SessionSidebar`),
  titlebar (`Titlebar`), floating pill + transcript panel (`RecordingView`).
- Added `shadow-liquid` + brighter white borders to the prominent buttons (pill
  pause/end, big start, settings Simpan/Simpan device, detail actions + danger +
  rebuild + finish, new-recording) for the glossy edge.

## Verification

- `bun run build` (tsc strict + Vite + Tailwind v4) — **OK** (69 modules; CSS
  21.6→22.7 kB). `@utility` with `::before/::after` compiles fine. Grep confirms no
  leftover `shadow-glass`/`shadow-pill`/`bg-glass-strong` usages.
- **Visual** needs `bun run tauri dev`. Intensity (border brightness, sheen opacity,
  shadow depth) all live in `@utility liquid-glass` / `--shadow-liquid` — easy to dial.

## Notes / adjustable

- Pill & titlebar now use `--color-glass` (0.58) instead of the old `-strong` (0.74),
  so slightly more transparent; can add a `liquid-glass-strong` variant if needed.
- If the user wants true frosted glass (desktop blurred behind the floating widget),
  that requires native acrylic (`window-vibrancy`) again.
