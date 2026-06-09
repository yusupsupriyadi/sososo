import type { SessionStateName } from '../../types/domain';

/**
 * Pure presentation logic for the live transcription widget's loading /
 * transitional states. Kept separate from the React view so it can be unit
 * tested without a DOM (the components themselves are verified by running the
 * app). The two real backend transitions we key off are `starting → recording`
 * (audio capture is up and Deepgram is connected) and the eventual teardown.
 */

/** Short header label for the current session state. */
export function sessionStatusLabel(state: SessionStateName, paused: boolean): string {
  // A running session that the user paused — but never let a stale pause flag
  // mask that we are still connecting or finishing.
  if (paused && (state === 'recording' || state === 'reconnecting')) return 'Paused';
  switch (state) {
    case 'starting':
      return 'Connecting…';
    case 'recording':
      return 'Recording';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'stopping':
      return 'Finishing…';
    case 'stopped':
      return 'Finished';
    case 'error':
      return 'Connection issue';
    case 'idle':
    default:
      return 'Idle';
  }
}

/** What the transcript body area should render right now. */
export type LiveBodyState =
  | 'connecting'
  | 'listening'
  | 'reconnecting'
  | 'finishing'
  | 'transcript';

/**
 * Decide the body content. Once any line has been captured we always show the
 * transcript (never hide it behind a loader — not even while finishing); only
 * an empty transcript falls back to a state-specific loader.
 */
export function liveBodyState(state: SessionStateName, segmentCount: number): LiveBodyState {
  if (segmentCount > 0) return 'transcript';
  switch (state) {
    case 'starting':
      return 'connecting';
    case 'reconnecting':
      return 'reconnecting';
    case 'stopping':
      return 'finishing';
    default:
      // recording (or a non-fatal error) with nothing transcribed yet: the
      // stream is live and we are simply waiting for the first audio.
      return 'listening';
  }
}
