import { create } from 'zustand';
import type { TranscriptSegmentEvent } from '../types/domain';

export type Segment = TranscriptSegmentEvent;

/** Per-segment live-translation cache entry (keyed by segmentId). */
export interface TranslationEntry {
  status: 'pending' | 'done' | 'error';
  /** Translated text once status === 'done'. */
  text?: string;
  /** Original (final) text this translation was produced for — lets us skip
   *  re-translating an unchanged line. */
  forText: string;
  /** Target language (display name) the translation was produced for. */
  lang: string;
}

interface TranscriptState {
  segments: Segment[];
  /** Live-translations keyed by segmentId (parallel to `segments`). */
  translations: Record<string, TranslationEntry>;
  /** Insert a new segment or replace an existing one with the same id
   *  (interim updates -> finalized). */
  upsert: (seg: Segment) => void;
  /** Set/replace the translation cache entry for a segment. */
  setTranslation: (segmentId: string, entry: TranslationEntry) => void;
  reset: () => void;
}

export const useTranscriptStore = create<TranscriptState>((set) => ({
  segments: [],
  translations: {},
  upsert: (seg) =>
    set((s) => {
      const idx = s.segments.findIndex((x) => x.segmentId === seg.segmentId);
      if (idx >= 0) {
        const next = s.segments.slice();
        next[idx] = seg;
        return { segments: next };
      }
      return { segments: [...s.segments, seg] };
    }),
  setTranslation: (segmentId, entry) =>
    set((s) => ({ translations: { ...s.translations, [segmentId]: entry } })),
  reset: () => set({ segments: [], translations: {} }),
}));
