import { useEffect } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { onSessionState, onTranscriptSegment } from '../lib/events';
import { useTranscriptStore } from '../state/transcriptStore';
import { useSessionStore } from '../state/sessionStore';

/**
 * Subscribes the current window to backend session + transcript events and pipes
 * them into the zustand stores. Mount once (the app is a single window).
 */
export function useTranscriptStream(): void {
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    let active = true;
    const keep = (u: UnlistenFn) => (active ? unlisteners.push(u) : u());

    const { upsert, reset } = useTranscriptStore.getState();
    const { patch } = useSessionStore.getState();

    onSessionState((e) => {
      if (e.state === 'starting') reset();
      // Reset the pause accounting at the start/end of a session.
      const fresh = e.state === 'recording' || e.state === 'stopped' || e.state === 'idle';
      patch({
        state: e.state,
        sessionId: e.sessionId,
        error: e.error ?? null,
        startedAt:
          e.state === 'recording'
            ? Date.now()
            : e.state === 'stopped' || e.state === 'idle'
              ? null
              : useSessionStore.getState().startedAt,
        ...(fresh ? { paused: false, pausedAt: null, pausedTotalMs: 0 } : {}),
      });
    }).then(keep);

    onTranscriptSegment((seg) => upsert(seg)).then(keep);

    return () => {
      active = false;
      unlisteners.forEach((u) => u());
    };
  }, []);
}
