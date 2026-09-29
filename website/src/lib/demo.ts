// The hero's scripted session as a pure function of time, so pause, restart and
// finish in src/hero-demo.ts are just seeks on one clock.

export type DemoSource = 'you' | 'remote';

export interface DemoLine {
  source: DemoSource;
  /** Label as the app prints it: "You" or the diarized "Speaker N". */
  speaker: string;
  text: string;
  /** Indonesian, the language the app pins first in its translate list. */
  translation: string;
}

export const DEMO_LINES: readonly DemoLine[] = [
  {
    source: 'remote',
    speaker: 'Speaker 1',
    text: 'Morning! Can everyone see the release board?',
    translation: 'Pagi! Semua bisa lihat papan rilisnya?',
  },
  {
    source: 'you',
    speaker: 'You',
    text: 'Yes. The build is green and the installer looks good.',
    translation: 'Ya. Build-nya hijau dan installer-nya aman.',
  },
  {
    source: 'remote',
    speaker: 'Speaker 2',
    text: 'Great. Can we ship it on Friday?',
    translation: 'Mantap. Bisa kita rilis hari Jumat?',
  },
  {
    source: 'you',
    speaker: 'You',
    text: "Let's do it. I'll write the changelog after this call.",
    translation: 'Ayo. Saya tulis changelog-nya setelah call ini.',
  },
];

export const DEMO_SUMMARY = {
  points: ['The build is green and the installer checks out.', 'The release ships on Friday.'],
  action: 'You write the changelog after the call.',
} as const;

/** Seconds. */
export const DEMO_TIMING = {
  connect: 1.2,
  word: 0.16,
  settle: 0.35,
  gap: 0.8,
  translate: 0.9,
  finish: 1.6,
  summary: 6,
} as const;

export interface LineSlot {
  start: number;
  finalAt: number;
  words: number;
}

export function lineSchedule(): LineSlot[] {
  const slots: LineSlot[] = [];
  let cursor: number = DEMO_TIMING.connect;
  for (const line of DEMO_LINES) {
    const words = line.text.split(' ').length;
    const finalAt = cursor + words * DEMO_TIMING.word + DEMO_TIMING.settle;
    slots.push({ start: cursor, finalAt, words });
    cursor = finalAt + DEMO_TIMING.gap;
  }
  return slots;
}

const SLOTS = lineSchedule();

export const FINISH_AT = SLOTS[SLOTS.length - 1].finalAt + DEMO_TIMING.gap;
export const SUMMARY_AT = FINISH_AT + DEMO_TIMING.finish;
export const DEMO_DURATION = SUMMARY_AT + DEMO_TIMING.summary;

export type DemoPhase = 'connecting' | 'recording' | 'finishing' | 'finished';
export type TranslationState = 'none' | 'pending' | 'done';

export interface LineFrame {
  index: number;
  /** How many words of the line are on screen. */
  words: number;
  final: boolean;
  translation: TranslationState;
}

export interface DemoFrame {
  phase: DemoPhase;
  /** Whole seconds the widget's clock shows. */
  elapsed: number;
  lines: LineFrame[];
}

/**
 * The widget's state at loop time `t` (seconds). `translateFrom` is the loop
 * time translate was switched on, or null while it is off. Like the app, only
 * lines that finalize after the switch get a translation.
 */
export function demoFrame(t: number, translateFrom: number | null): DemoFrame {
  const time = Math.min(Math.max(t, 0), DEMO_DURATION);

  const phase: DemoPhase =
    time < DEMO_TIMING.connect
      ? 'connecting'
      : time < FINISH_AT
        ? 'recording'
        : time < SUMMARY_AT
          ? 'finishing'
          : 'finished';

  const clockEnd = Math.min(time, FINISH_AT);
  const elapsed = Math.max(0, Math.floor(clockEnd - DEMO_TIMING.connect));

  const lines: LineFrame[] = [];
  SLOTS.forEach((slot, index) => {
    if (time < slot.start) return;
    const shown = Math.min(slot.words, Math.floor((time - slot.start) / DEMO_TIMING.word) + 1);
    const final = time >= slot.finalAt;

    let translation: TranslationState = 'none';
    if (final && translateFrom !== null && slot.finalAt >= translateFrom) {
      translation = time < slot.finalAt + DEMO_TIMING.translate ? 'pending' : 'done';
    }

    lines.push({ index, words: shown, final, translation });
  });

  return { phase, elapsed, lines };
}

export function formatClock(seconds: number): string {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}
