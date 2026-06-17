export interface DeviceInfo {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface DeviceLists {
  input: DeviceInfo[];
  output: DeviceInfo[];
}

/** A capturable top-level window for the video-recording picker (Windows). */
export interface WindowInfo {
  /** Opaque, stable-within-a-session id (raw HWND as a decimal string). */
  id: string;
  title: string;
  /** Owning process/executable name (e.g. "Zoom.exe"). */
  app: string;
  /** Small JPEG preview as a data URL, or null/absent when the window can't be
   *  snapshotted (minimized, protected) or the platform has no thumbnails yet. */
  thumbnail?: string | null;
}

/** A meeting that looks active right now (meeting auto-detection, Windows). */
export interface DetectedMeeting {
  /** Platform display name: "Zoom" | "Google Meet" | "Microsoft Teams" | "Webex". */
  platform: string;
  /** The matched window's title (context for the prompt). */
  title: string;
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

/** Which AI backend powers session summaries + live translation + transcript
 *  chat. Each value is also its OS-keychain service name. Mirrors the Rust
 *  `ai::Provider` ids. */
export type AiProvider = 'openai' | 'gemini' | 'anthropic' | 'glm' | 'kimi' | 'grok' | 'deepseek';

/** Keychain service for an API key: Deepgram (speech-to-text) plus every AI
 *  provider (each stores its own key). */
export type ApiService = 'deepgram' | AiProvider;

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
  /** Saved screen-recording file path (absolute), or null if none was recorded. */
  videoPath?: string | null;
}

/** A persisted (finalized) transcript line. */
export interface StoredSegment {
  /** Stable id `{session}:{channel}:{start}` — needed to (re)translate a saved line. */
  segmentId: string;
  source: Source;
  speaker?: string | null;
  text: string;
  tStart: number;
  tEnd?: number | null;
  confidence?: number | null;
  /** Live translation of `text`, or null if the line was never translated. */
  translation?: string | null;
  /** Target language (display name) the translation was produced for. */
  translationLang?: string | null;
}

export interface SessionDetail {
  session: SessionSummary;
  segments: StoredSegment[];
}

/** One turn of the per-session transcript chat. */
export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  /** AI model that produced an assistant reply; null for the user's questions. */
  model?: string | null;
  /** RFC-3339 timestamp. */
  createdAt: string;
}

/** One full-text search result: a matching session with a highlighted snippet. */
export interface SearchHit {
  sessionId: number;
  title: string;
  /** RFC-3339 start timestamp. */
  startedAt: string;
  /** Best-matching line excerpt with matched terms wrapped in `[`…`]`. */
  snippet: string;
  matchCount: number;
}
