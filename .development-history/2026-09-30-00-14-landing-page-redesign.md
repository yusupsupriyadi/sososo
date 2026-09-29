# Landing page redesign: paper & ink, captioned-call motion

## Summary

Full rebuild of `website/` (user-approved direction "paper & ink"). The page now reads as one
captioned call: headings arrive interim → final like sososo's own captions, timecodes mark the
sections that happen during the call, and the logo's concentric rings are the only decoration.
Copy was brought up to date with the app (9 AI providers incl. local Llama, "Speaker N"
diarization labels, translate toggle, tray + hotkey, meeting detection) and scrubbed of AI-slop
patterns (em dashes, eyebrow labels, badge strip, bento grid, emoji, sparkle icon).

## Changes

- `website/index.html`: new structure (hero widget, shortcut, two-input timeline, live sentence,
  languages + translation, video, after the call, privacy flow, demo, download, open source).
- `website/src/styles.css`: light/dark tokens, Unbounded + Atkinson Hyperlegible, app recreations.
- `website/src/lib/demo.ts` (+ test): hero demo as a pure function of time; `lib/theme.ts` (+ test).
- `website/src/hero-demo.ts`: widget renderer; pause / finish / translate drive one GSAP clock.
- `website/src/motion.ts`: GSAP ScrollTrigger + SplitText choreography, lazy-loaded.
- `website/package.json`: `gsap@^3.15.0`.

## Decisions

- Light theme default with a working dark toggle; app UI always sits on an ink "stage".
- Motion off (static final states) under `prefers-reduced-motion`; `?motion` forces it, `?debug`
  exposes `gsap`/`ScrollTrigger` for frame-by-frame review.
- Numbers shown are sourced: 79 languages from `src/lib/languages.ts`; stars/version live from API.

## Verification

- `bun test` (root): 103 pass; website `tsc && vite build`: green; ESLint: 0 errors in `website/`.
- Contrast script: every text pair ≥ 5.40:1. BrowserOS Neo pass at 1442px, 820px and 390px, both
  themes, reduced motion: all controls, menu, anchors; no console errors; no horizontal overflow.

## Limitations

- Real Tab-key traversal could not be driven in a background tab; focus order checked by DOM order.

## Follow-up

- Push to master deploys GitHub Pages; left for the user to review first.
