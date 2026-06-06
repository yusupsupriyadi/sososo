# UI: transparent glass (remove blur)

- **Date:** 2026-06-06

## Goal

User correction: the intent was **transparent glass**, not frosted/blur. The old design used two blur layers —
native acrylic (window-vibrancy) + CSS `backdrop-filter: blur()`.

## Changes

Remove **all** blur; the "glass" tint now comes purely from panel background alpha (CSS).

**Backend:** `lib.rs` — remove `apply_acrylic` use + calls (overlay + main); windows stay `transparent: true`
without acrylic. `Cargo.toml` — drop `window-vibrancy`.

**Frontend (CSS):** `glass.css` — remove `backdrop-filter`/`-webkit-backdrop-filter` (keep tint + border +
highlight + drop-shadow). `theme.css` — raise tint alpha so text stays readable (`--glass-bg` 0.45→0.58,
`--glass-bg-strong` 0.62→0.74); drop unused `--blur`. `reset.css` — comment update.

**Docs:** `CLAUDE.md` — architecture: glass = transparent, no acrylic/vibrancy, tint from `--glass-bg`.

## Notes

- Result: semi-transparent floating glass panels, the desktop **sharp** behind (not blurred). Adjust
  transparency via `--glass-bg` / `--glass-bg-strong` in `theme.css`.

## Verification

- `bun run build` — OK. `cargo check` — OK (no `window-vibrancy` refs left). Visual not tested headless.
