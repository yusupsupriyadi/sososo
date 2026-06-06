# Per-speaker label colors in the transcript

**Goal:** Color each speaker's label differently (Speaker 1/2/3/4…) in both the
live recording view and the saved session history, instead of all remote
speakers sharing one color.

## Key changes

- **`src/lib/speaker.ts`** (new): `speakerColor(source, speaker)` helper.
  - `"You"` (mic) → accent blue `#6ea8fe` (matches `--color-accent`).
  - Remote speakers → distinct hue from an 8-color dark-glass palette, indexed
    by the diarization number parsed from `"Speaker N"` (1-based label → 0-based
    slot), cycling for speakers beyond the palette.
  - Non-numeric / null labels: stable string hash → same color for same name;
    null falls back to slot 0 (purple, the previous remote color).
  - Palette avoids the blue reserved for "You" and the red/amber reserved for
    rec/error states.
- **`RecordingView.tsx`** (live): label color now from `speakerColor(c.source,
c.speaker)` via inline `style.color` (was a `clsx` `text-accent`/`text-accent-2`
  ternary on `source`). `clsx` still used for the transcript text span.
- **`SessionDetailRoute.tsx`** (history): same swap; removed the now-unused
  `clsx` import.

## Notes / decisions

- Inline `style.color` (not Tailwind classes) because the color is data-driven
  and Tailwind v4 can't statically pick up dynamic class names. Matches the
  existing inline `fontSize` pattern (font-size settings).
- Speaker labels come from `session.rs`: `"You"` for mic, `format!("Speaker {}",
s + 1)` for diarized remote, or `None`.

## Verification

- `bun run build` (tsc strict + vite build) — passes, no unused-import errors.
