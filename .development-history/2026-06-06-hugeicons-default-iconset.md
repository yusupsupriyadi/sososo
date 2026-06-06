# Hugeicons as the default icon set

**Goal:** Replace every ad-hoc UI glyph (emoji + hand-written inline `<svg>`) with the
free **Hugeicons** set so the whole app shares one consistent icon system.

## Packages

- `@hugeicons/react@1.1.6` — the `<HugeiconsIcon>` wrapper component.
- `@hugeicons/core-free-icons@4.2.0` — the free icon pack (MIT, ~4k stroke icons).
- `sideEffects:false` + named ESM exports → Vite tree-shakes; only the ~14 icons used
  are bundled (JS 277.95 → 289.76 kB, +~12 kB).

## Central icon map (`src/lib/icons.ts`)

Re-exports the chosen icons under semantic aliases so the set can be swapped from one
place. Icons inherit color via `currentColor` (the wrapper default), so existing
Tailwind text-color classes keep the yellow/red/dim styling.

| Alias                                          | Hugeicons export                                            | Used for                    |
| ---------------------------------------------- | ----------------------------------------------------------- | --------------------------- |
| `IconMinimize` / `IconClose`                   | `MinusSignIcon` / `Cancel01Icon`                            | titlebar                    |
| `IconAdd` / `IconSettings`                     | `Add01Icon` / `Settings01Icon`                              | sidebar, start screen       |
| `IconMic` / `IconRecord`                       | `Mic01Icon` / `RecordIcon`                                  | start-screen hero + button  |
| `IconPlay` / `IconPause` / `IconStop`          | `PlayIcon` / `PauseIcon` / `StopIcon`                       | recording pill              |
| `IconDrag`                                     | `DragDropVerticalIcon`                                      | recording drag handle       |
| `IconRename` / `IconDelete` / `IconRegenerate` | `Edit02Icon` / `Delete02Icon` / `ArrowReloadHorizontalIcon` | session detail              |
| `IconCheck`                                    | `CheckmarkCircle02Icon`                                     | "saved", Finish & Summarize |

Render: `<HugeiconsIcon icon={IconClose} size={16} strokeWidth={2} aria-hidden={true} />`.

## Changes

- **Titlebar** — `—`/`✕` → `IconMinimize`/`IconClose`; added `aria-label`s.
- **SessionSidebar** — `＋`/`⚙` → `IconAdd`/`IconSettings`; NavLinks now `flex items-center gap-2`.
- **LibraryRoute** — hero `🎙️` → `IconMic` (accent, size 46); `⚙`/`●` → `IconSettings`/`IconRecord`;
  `BIG_BTN_BASE` switched `inline-block` → `inline-flex items-center justify-center gap-2`.
- **SettingsRoute** — two `✓ saved` badges → `IconCheck` + "saved".
- **SessionDetailRoute** — `✎`/`🗑`/`↻`/`✓` → `IconRename`/`IconDelete`/`IconRegenerate`/`IconCheck`;
  `ACTION_BTN` + action buttons gained `inline-flex items-center gap`.
- **RecordingView** — inline pause/play, stop and 6-dot grip SVGs → `IconPause`/`IconPlay`,
  `IconStop`, `IconDrag` (`[&>svg]:pointer-events-none` still matches the wrapper's root `<svg>`).

## Verification

- `bun run build` (tsc strict + Vite) ✓ — 75 modules, no type / unused-import errors.
- Exact export names confirmed against the installed `core-free-icons` type declarations
  before wiring (avoids strict-mode build breaks from guessed names).

## Notes

- The deps (`package.json` + `bun.lock`) were already committed in `18c4e5f`
  (the Prettier/Husky setup commit bundled them); this commit is source-only.
- A repo-wide Prettier reformat is in flight separately — left untouched here (out of scope).
