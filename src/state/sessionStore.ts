import { create } from 'zustand';
import type { SessionStateName } from '../types/domain';

interface SessionStore {
  state: SessionStateName;
  sessionId: number | null;
  /** Epoch ms when the current active (un-paused) run began. */
  startedAt: number | null;
  /** Whether the session is currently paused (frontend-driven). */
  paused: boolean;
  /** Epoch ms the current pause began, or null when running. */
  pausedAt: number | null;
  /** Total paused time so far (ms), excluded from the elapsed timer. */
  pausedTotalMs: number;
  error: string | null;
  patch: (p: Partial<Omit<SessionStore, 'patch' | 'setPaused'>>) => void;
  /** Toggle pause and keep the elapsed-time accounting consistent. */
  setPaused: (paused: boolean) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  state: 'idle',
  sessionId: null,
  startedAt: null,
  paused: false,
  pausedAt: null,
  pausedTotalMs: 0,
  error: null,
  patch: (p) => set(p),
  setPaused: (paused) =>
    set((s) => {
      if (paused === s.paused) return {};
      if (paused) return { paused: true, pausedAt: Date.now() };
      const add = s.pausedAt ? Date.now() - s.pausedAt : 0;
      return {
        paused: false,
        pausedAt: null,
        pausedTotalMs: s.pausedTotalMs + add,
      };
    }),
}));
