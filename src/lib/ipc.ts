import { invoke } from '@tauri-apps/api/core';
import type {
  AiProvider,
  ApiService,
  ChatMessage,
  DeviceLists,
  SearchHit,
  SessionDetail,
  SessionSummary,
  StartResult,
  StopResult,
  WindowInfo,
} from '../types/domain';

// Tauri maps camelCase JS keys to snake_case Rust params automatically.

export const listDevices = (): Promise<DeviceLists> => invoke('list_devices');

export const setDevices = (inputId: string | null, outputId: string | null): Promise<void> =>
  invoke('set_devices', { inputId, outputId });

export const startSession = (title?: string | null): Promise<StartResult> =>
  invoke('start_session', { title: title ?? null });

export const stopSession = (): Promise<StopResult> => invoke('stop_session');

export const setApiKey = (service: ApiService, value: string): Promise<void> =>
  invoke('set_api_key', { service, value });

export const hasApiKey = (service: ApiService): Promise<boolean> =>
  invoke('has_api_key', { service });

export const setTranscriptionOptions = (
  language: string | null,
  systemOnly: boolean | null,
): Promise<void> => invoke('set_transcription_options', { language, systemOnly });

/** Pause/resume the active session (backend stops/forwards audio to Deepgram). */
export const setPaused = (paused: boolean): Promise<void> => invoke('set_paused', { paused });

// --- Video recording (Windows) ---

/** List capturable windows for the Start-screen video picker. */
export const listWindows = (): Promise<WindowInfo[]> => invoke('list_windows');

/** Persist whether to record video and which window (raw HWND id) to capture.
 *  Each arg is optional (null = leave unchanged); an empty `windowId` clears it. */
export const setVideoOptions = (enabled: boolean | null, windowId: string | null): Promise<void> =>
  invoke('set_video_options', { enabled, windowId });

// --- Session history ---

export const listSessions = (): Promise<SessionSummary[]> => invoke('list_sessions');

export const getSession = (id: number): Promise<SessionDetail | null> =>
  invoke('get_session', { id });

/** Full-text search across all transcripts; resolves to one hit per matching
 *  session (most relevant first) with a highlighted snippet. */
export const searchSessions = (query: string): Promise<SearchHit[]> =>
  invoke('search_sessions', { query });

export const deleteSession = (id: number): Promise<void> => invoke('delete_session', { id });

export const renameSession = (id: number, title: string): Promise<void> =>
  invoke('rename_session', { id, title });

/** Rename a speaker label across one session's transcript. `from` is the current
 *  stored label (null = the un-diarized group); `to` is the new name. Resolves to
 *  the number of transcript lines updated. */
export const renameSpeaker = (
  sessionId: number,
  from: string | null,
  to: string,
): Promise<number> => invoke('rename_speaker', { sessionId, from, to });

// --- AI summary ---

/** Read the persisted AI-summary output language (a language code or "auto"). */
export const getSummaryLanguage = (): Promise<string> => invoke('get_summary_language');

/** Persist the AI-summary output language (a language code or "auto"). */
export const setSummaryLanguage = (language: string): Promise<void> =>
  invoke('set_summary_language', { language });

/** Read the active AI provider ("openai" | "gemini"). Defaults to "openai". */
export const getAiProvider = (): Promise<AiProvider> => invoke('get_ai_provider');

/** Persist the active AI provider ("openai" | "gemini"). Governs both session
 *  summaries and live translation. */
export const setAiProvider = (provider: AiProvider): Promise<void> =>
  invoke('set_ai_provider', { provider });

/** Generate + persist an AI summary for a session; resolves to the Markdown text.
 *  `summaryLanguage` is the literal "auto" (match the transcript) or a
 *  human-readable language name like "Indonesian". */
export const summarizeSession = (id: number, summaryLanguage: string): Promise<string> =>
  invoke('summarize_session', { id, summaryLanguage });

// --- Live translation ---

/** Translate one finalized transcript line into `targetLang` (a display name
 *  like "English"); resolves to the translated text. The backend persists it and
 *  is idempotent, so a line is never translated twice. */
export const translateSegment = (
  sessionId: number,
  segmentId: string,
  text: string,
  targetLang: string,
): Promise<string> => invoke('translate_segment', { sessionId, segmentId, text, targetLang });

// --- Transcript chat ---

/** All stored chat turns for a session (oldest first). */
export const getChatMessages = (sessionId: number): Promise<ChatMessage[]> =>
  invoke('get_chat_messages', { sessionId });

/** Ask a question about a session's transcript via the active AI provider; the
 *  exchange is persisted. Resolves to the two newly stored turns `[user, assistant]`. */
export const chatSession = (id: number, message: string): Promise<ChatMessage[]> =>
  invoke('chat_session', { id, message });

/** Delete a session's entire chat history. */
export const clearChat = (sessionId: number): Promise<void> => invoke('clear_chat', { sessionId });
