import { create } from 'zustand';
import type { TranscriptSegmentEvent } from '../types/domain';

export type Segment = TranscriptSegmentEvent;

interface TranscriptState {
  segments: Segment[];
  /** Insert a new segment or replace an existing one with the same id
   *  (interim updates -> finalized). */
  upsert: (seg: Segment) => void;
  reset: () => void;
}

export const useTranscriptStore = create<TranscriptState>((set) => ({
  segments: [],
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
  reset: () => set({ segments: [] }),
}));
