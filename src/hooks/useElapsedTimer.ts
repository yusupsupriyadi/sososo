import { useEffect, useState } from 'react';
import { useSessionStore } from '../state/sessionStore';

function format(totalSeconds: number): string {
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** "HH:MM:SS" active recording time (paused time excluded); "00:00:00" when idle. */
export function useElapsedLabel(): string {
  const startedAt = useSessionStore((s) => s.startedAt);
  const state = useSessionStore((s) => s.state);
  const paused = useSessionStore((s) => s.paused);
  const pausedAt = useSessionStore((s) => s.pausedAt);
  const pausedTotalMs = useSessionStore((s) => s.pausedTotalMs);
  const [, force] = useState(0);

  useEffect(() => {
    // No need to tick while paused — the display is frozen.
    if (state !== 'recording' || !startedAt || paused) return;
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [state, startedAt, paused]);

  if (!startedAt || state !== 'recording') return '00:00:00';
  const end = paused && pausedAt ? pausedAt : Date.now();
  return format(Math.max(0, Math.floor((end - startedAt - pausedTotalMs) / 1000)));
}
