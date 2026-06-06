# Icon-rich UI (meaningful Hugeicons everywhere)

**Goal:** Make the UI more legible/scannable by adding meaningful Hugeicons to labels,
headers, metadata, states and speaker tags — building on the Hugeicons migration.
Scope chosen by the user: "meaningful & comprehensive".

## New aliases added to `src/lib/icons.ts`

`IconBack` (ArrowLeft02) · `IconWave` (AudioWave01) · `IconSpeaker` (Speaker01) ·
`IconDevices` (Headphones) · `IconLanguage` (Globe02) · `IconCalendar` (Calendar03) ·
`IconLines` (TextAlignLeft) · `IconTranscript` (Captions) · `IconHistory` ·
`IconKey` (Key01) · `IconAppearance` (TextFont) · `IconAi` (Sparkles) ·
`IconRemote` (UserMultiple02) · `IconAlert` (Alert02) · `IconInbox` · `IconNoTranscript` (CaptionsOff).

## Per-screen changes

- **Titlebar** — brand: gradient dot → `IconWave` (accent).
- **Sidebar** — `IconHistory` on the History header; each session row leads with `IconTranscript`
  (row relaid out: icon + truncating title/meta column); empty state → centered `IconInbox`.
- **Start screen** — field labels gain leading icons (Language→globe, Audio source→wave,
  Microphone→mic, System audio→speaker, Translate to→globe, Live-translate→globe);
  no-Deepgram-key state → `IconKey`; OpenAI-key warning & error → `IconAlert`.
- **Settings** — section headers iconned (API Keys→key, Audio Devices→headphones,
  Appearance→font, Language→globe); device field labels → mic / speaker; status line →
  `IconCheck` on success, `IconAlert` on `Error/Failed` (+ amber color).
- **Session detail** — Back link → `IconBack`; metadata row → icon chips
  (calendar / globe / lines / mic|speaker); AI Summary header → `IconAi`; transcript speaker
  tags → mic (You) / people (Other), inheriting `speakerColor` via `currentColor`;
  empty → `IconNoTranscript`; error → `IconAlert`.
- **Recording widget** — hand-drawn translate-toggle `<svg>` globe replaced with `IconLanguage`
  (kills the last inline SVG); live speaker tags → mic / people; error → `IconAlert`.

## Notes

- All icons are monochrome and inherit `currentColor`, so the liquid-glass look and the
  yellow/red/dim/accent colors are unchanged. Speaker-tag icons scale with `transcriptScale`
  (`size = round(12 × scale)`).
- Verified: `bun run build` (tsc strict + Vite) ✓ — 77 modules, JS 290 → 309 kB
  (more distinct icons tree-shaken in).
- Shares files with the in-flight live-translation feature; only frontend UI components touched,
  backend Rust left alone.
