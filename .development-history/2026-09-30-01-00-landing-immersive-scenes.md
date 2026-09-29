# Landing page: immersive ring field and scroll scenes

## Summary

Follow-up to the paper-and-ink rebuild (user: "more amazing, more immersive"). The hero now sits on a
WebGL sound field: two concentric-ring emitters (the logo's O) XOR into an op-art moiré, one behind
the widget (the call), one trailing the pointer (you); each finished caption pulses from its speaker.
A pinned record scene turns the O into the record button: Ctrl+Alt+R, the dot turns red, flies into a
nav call clock that runs with the page's timecodes, then the camera pushes through the O.

## Changes

- `website/src/field.ts`: WebGL1 ring-field renderer (moiré, pocket + halo calm zones, pulses, edge fade).
- `website/src/scene.ts`: hero field (pointer emitter, opt-in mic level), finale field from the wordmark's O's.
- `website/src/listen.ts`: opt-in mic loudness only (nothing recorded or sent); `tracks.ts`: seeded waveforms.
- `website/src/lib/timeline.ts` (+ test): scroll → call time, hh:mm:ss, seeded wave heights.
- `website/src/motion.ts`: Lenis smooth scroll, record scene, call clock, flying words, after-the-call beats.
- `website/index.html`, `styles.css`: new hero/start/after markup, nav clock, floating glass, layered `.btn`.

## Decisions

- Pins start under the 68px nav; the after scene pins only at ≥780px tall, otherwise scrubs in flow.
- `.btn` moved to `@layer components`: unlayered it beat Tailwind's `hidden` (nav Download showed on phones).
- Reduced motion: no Lenis, one static field frame, mic hidden, every scene in its final state.

## Verification

- `bun test` root 113 pass (website 45); `tsc && vite build` green; ESLint 0 errors; Prettier clean.
- BrowserOS Neo at 1298px and 390px, both themes, reduced motion: pins, fly-to-clock, push-through,
  waveforms, fold → summary → chat, finale; no console errors; no horizontal overflow; 0 em dashes.

## Limitations

- Real microphone input was not exercised (a permission prompt in the user's browser); checked by code.

## Follow-up

- Push to master deploys GitHub Pages; left for the user.
