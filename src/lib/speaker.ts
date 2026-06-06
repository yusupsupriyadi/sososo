// Per-speaker label colors for the transcript views (live + history).
//
// The backend labels each segment's speaker as "You" (mic / your own voice) or
// "Speaker N" (Deepgram diarization index, 1-based) — see session.rs. "You"
// keeps the accent blue; every diarized remote speaker gets its own distinct
// hue so Speaker 1/2/3/4… are visually told apart at a glance.

import type { Source } from '../types/domain';

/** Accent blue (matches --color-accent) reserved for the user's own voice. */
const YOU_COLOR = '#6ea8fe';

/**
 * Distinct, dark-glass-friendly hues for diarized remote speakers. Ordered so
 * adjacent speakers contrast strongly. Deliberately avoids the blue reserved
 * for "You" and the red/amber reserved for recording/error states.
 */
const SPEAKER_PALETTE = [
  '#b794f6', // purple
  '#5fd1a8', // green
  '#f6c177', // gold
  '#f78fb3', // pink
  '#56cfe1', // cyan
  '#c3e88d', // lime
  '#ff9e64', // coral
  '#9d8cff', // indigo
];

/** Map a speaker label to a 0-based palette slot. */
function speakerSlot(speaker?: string | null): number {
  if (!speaker) return 0;
  // "Speaker 1" → 0, "Speaker 2" → 1, … (1-based label to 0-based slot).
  const match = /(\d+)/.exec(speaker);
  if (match) return Math.max(0, parseInt(match[1], 10) - 1);
  // Non-numeric label: stable hash so the same name keeps the same color.
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = (hash * 31 + speaker.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Color for a transcript speaker label. "You" → accent blue; each diarized
 * remote speaker → a distinct palette hue, cycling for speakers beyond the
 * palette length.
 */
export function speakerColor(source: Source, speaker?: string | null): string {
  if (source === 'you') return YOU_COLOR;
  return SPEAKER_PALETTE[speakerSlot(speaker) % SPEAKER_PALETTE.length];
}
