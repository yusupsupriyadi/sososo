# Migrate pure CSS → Tailwind CSS v4 (pragmatic)

- **Date:** 2026-06-06

## Goal
Move the hand-written CSS (~892 lines, 4 files) to Tailwind **v4** without changing the look
(transparent-glass, no blur). Chosen scope: **pragmatic** — tokens → `@theme`, simple layout →
utilities in JSX, complex/stateful/dynamic patterns → component classes in `@layer components`.

## Setup
- `bun add tailwindcss @tailwindcss/vite` → v4.3.0.
- `vite.config.ts`: add `tailwindcss()` to `plugins`. No `tailwind.config.js`/PostCSS (v4 auto-detects).
- New single entry `src/styles/app.css`: `@import "tailwindcss"` + `@theme` + top-level `@keyframes
  rec-pulse` + `@layer base` (reset) + `@layer components` (all component classes).
- `src/main.tsx`: 3 imports (reset/theme/glass.css) → one `import "./styles/app.css"`.
- `src/windows/main/MainApp.tsx`: drop `import "./main.css"`.
- Deleted `src/styles/{reset,theme,glass}.css` + `src/windows/main/main.css`.

## Tokens (@theme) — values unchanged, names normalized
- Text renamed `--text*` → `--color-fg`/`-dim`/`-faint` (clean `text-fg`).
- `--color-accent`, `-accent-2`, `-rec`, `-ok`; glass set `--color-glass`/`-strong`/`-border`/
  `-highlight`, `--color-hover`/`-active`.
- Radii override Tailwind defaults to 8/12/16 (`rounded-sm/md/lg`).
- `--font-sans` = Segoe stack; `--animate`? used plain `@keyframes` + `animation:`.
- v4 emits each as a `:root` CSS var AND a utility, so `var(--color-…)` and `bg-glass`/`text-accent`
  both work.

## Components
- **Simple wrappers → utilities in JSX** (class removed): `main-root`, `main-body`, `content`(+`glass`),
  `brand`, `spacer`, `route-center`(×3), `recording-root`, `rec-captions` — exact px mapping
  (`p-2`=8px, `gap-2`, `h-screen`, `p-6`=24px, `text-[13px]`, `p-[14px]`, …).
- **Everything else → `@layer components`** with `@apply` (token/utility) + plain CSS for exact
  effects (box-shadow, `filter: brightness`, transitions, `@keyframes`, descendant combinators).
  **Class names kept**, so component logic is untouched: `clsx(...)` in RecordingView, the
  `` `line ${source}` `` template literal, NavLink `.active`, and `.caption.you .speaker` combinators
  all keep working with no TSX changes.

## Verification
- `bun run build` (tsc strict + Vite + Tailwind v4) — **OK** (69 modules; CSS 12.6→24.2 kB = preflight
  + utilities, gzip 5.1 kB). All `@apply` utilities resolve; no unused-import TS errors.
- Backend (Rust) untouched.
- **Visual not testable headless** → run `bun run tauri dev` to confirm every screen is identical.

## Known caveat (preflight)
Tailwind preflight removes default element margins (e.g. bare `<p>`). A few unstyled `.muted`
paragraphs in empty/loading states (e.g. "Memuat…", "Tidak ada transkrip…") may sit slightly tighter
than before. Trivial to restore with an explicit margin if undesired. Headings/buttons/inputs/lists all
have explicit styles so are unaffected.

## Follow-up: full utility-first (no @layer components)
Per user request, went all the way to utility-first. Removed the entire `@layer components` block;
every component class (`.glass`, `.icon-btn`, `.rec-pill`, `.caption`, `.settings`, `.detail`, …) is now
inline utility classes in JSX across all 7 components. `app.css` now holds only `@import`, `@theme`
tokens, `@keyframes`, and `@layer base`.
- Added `@theme` tokens so multi-part values stay single utilities: `--shadow-glass`, `--shadow-pill`
  (→ `shadow-glass`/`shadow-pill`) and `--animate-rec-pulse` (→ `animate-rec-pulse`). Native `<option>`
  dark bg moved to `@layer base` (`option{}`) since per-element styling isn't reliable.
- Dynamic styling moved into JSX: NavLink `.active` → `className={({isActive}) => clsx(...)}`; the
  `.caption.you .speaker` / `.line.you .line-speaker` combinators → conditional `text-accent`/
  `text-accent-2` on the child; `clsx("caption", source, interim)` → exclusive conditional utilities;
  `.rec-dot.is-live/.is-error` → exclusive `bg-*`/`animate-*`. Repeated patterns use small local
  `const` strings (e.g. `ICON_BTN`, `BIG_BTN_BASE`, `FIELD_CTRL`).
- Exact px preserved via arbitrary utilities (`text-[13px]`, `py-[9px]`, `bg-[rgba(110,168,254,0.2)]`,
  `brightness-[1.12]`, `scale-[0.92]`); transitions approximated with `transition[-colors] duration-[120ms]`.
- Verify: `bun run build` — **OK** (69 modules; CSS 24.2→21.6 kB). Grep confirms zero leftover component
  classes in JSX. Visual fidelity still needs `bun run tauri dev`.
