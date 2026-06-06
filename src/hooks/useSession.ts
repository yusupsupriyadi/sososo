import { useSessionStore } from '../state/sessionStore';
import { setPaused as ipcSetPaused, startSession, stopSession } from '../lib/ipc';

/** Start/stop/pause controls with optimistic state; backend events refine it. */
export function useSession() {
  const state = useSessionStore((s) => s.state);
  const error = useSessionStore((s) => s.error);
  const paused = useSessionStore((s) => s.paused);
  const patch = useSessionStore((s) => s.patch);
  const setPausedLocal = useSessionStore((s) => s.setPaused);

  const isActive = state === 'recording' || state === 'starting';

  async function start() {
    patch({ state: 'starting', error: null });
    try {
      await startSession();
    } catch (e) {
      patch({ state: 'error', error: String(e) });
    }
  }

  async function stop() {
    patch({ state: 'stopping' });
    try {
      await stopSession();
    } catch (e) {
      patch({ state: 'error', error: String(e) });
    }
  }

  async function togglePause() {
    const next = !paused;
    setPausedLocal(next); // optimistic: freezes timer + flips the label
    try {
      await ipcSetPaused(next);
    } catch (e) {
      setPausedLocal(!next); // revert on failure
      patch({ error: String(e) });
    }
  }

  return { state, error, isActive, paused, start, stop, togglePause };
}
