export interface DeviceInfo {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface DeviceLists {
  input: DeviceInfo[];
  output: DeviceInfo[];
}

export type SessionStateName =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'stopped'
  | 'reconnecting'
  | 'error';

export interface SessionStateEvent {
  sessionId: number | null;
  state: SessionStateName;
  startedAt?: string | null;
  error?: string | null;
}

export type Source = 'you' | 'remote';

export interface TranscriptSegmentEvent {
  sessionId: number;
  segmentId: string;
  source: Source;
  speaker?: string | null;
  text: string;
  tStart: number;
  tEnd?: number | null;
  isFinal: boolean;
  confidence?: number | null;
}

export interface StartResult {
  sessionId: number;
  startedAt: string;
}

export interface StopResult {
  sessionId: number;
  endedAt: string;
}

export type ApiService = 'deepgram' | 'openai';

// --- Session history (persisted) ---

export interface SessionSummary {
  id: number;
  title: string;
  /** Deepgram language code used for the session. */
  language: string;
  systemOnly: boolean;
  /** RFC-3339 timestamps. */
  startedAt: string;
  endedAt?: string | null;
  /** AI summary (Markdown) once generated; null until then. */
  summary?: string | null;
  summaryModel?: string | null;
  summarizedAt?: string | null;
  segmentCount: number;
}

/** A persisted (finalized) transcript line. */
export interface StoredSegment {
  source: Source;
  speaker?: string | null;
  text: string;
  tStart: number;
  tEnd?: number | null;
  confidence?: number | null;
}

export interface SessionDetail {
  session: SessionSummary;
  segments: StoredSegment[];
}
