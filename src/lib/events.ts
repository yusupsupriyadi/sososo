import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { SessionStateEvent, TranscriptSegmentEvent } from '../types/domain';

// The backend emits these globally; the app subscribes globally (see
// useTranscriptStream) and pipes them into the zustand stores.

export const onSessionState = (cb: (e: SessionStateEvent) => void): Promise<UnlistenFn> =>
  listen<SessionStateEvent>('session://state', (ev) => cb(ev.payload));

export const onTranscriptSegment = (cb: (e: TranscriptSegmentEvent) => void): Promise<UnlistenFn> =>
  listen<TranscriptSegmentEvent>('transcript://segment', (ev) => cb(ev.payload));
