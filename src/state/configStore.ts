import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Kode bahasa Deepgram (BCP-47, mis. "multi" | "id" | "en-US"). Daftar opsi
 *  yang ditampilkan ada di `lib/languages.ts`. */
export type LanguageCode = string;

interface ConfigStore {
  language: LanguageCode;
  /** true = system audio only (cleaner for videos); false = system + mic (meetings). */
  systemOnly: boolean;
  /** Selected microphone (input) device id. null = system default. Shared
   *  between the Start-transcription screen and Settings. */
  inputDevice: string | null;
  /** Selected system-audio (output to loop back) device id. null = system default. */
  outputDevice: string | null;
  /** Record the selected window's video alongside the transcription (Windows-only). */
  videoEnabled: boolean;
  /** Window id (raw HWND string) to record. In-memory only — HWNDs are per-run. */
  videoWindowId: string | null;
  /** Whole-UI zoom multiplier (CSS zoom). 1 = 100%. */
  uiScale: number;
  /** Font multiplier for transcript text + speaker labels (live + history). 1 = 100%. */
  transcriptScale: number;
  /** Liquid-glass panel fill opacity (alpha 0..1). Lower = more transparent. Default 0.58. */
  glassOpacity: number;
  /** Live-translate finalized transcript lines via OpenAI (off by default). */
  translateEnabled: boolean;
  /** Target language code for live translation (display name resolved via
   *  `lib/languages.ts`). Default "en". */
  targetLanguage: LanguageCode;
  /** Auto-generate an AI summary when a recording finishes (only if the active
   *  provider's API key is set). Default on. */
  autoSummarizeOnFinish: boolean;
  /** Collapse the transcript-chat sidebar (session detail) into a thin "Ask"
   *  strip. Default false (expanded). */
  chatCollapsed: boolean;
  setLanguage: (l: LanguageCode) => void;
  setSystemOnly: (s: boolean) => void;
  setInputDevice: (id: string | null) => void;
  setOutputDevice: (id: string | null) => void;
  setVideoEnabled: (v: boolean) => void;
  setVideoWindowId: (id: string | null) => void;
  setUiScale: (v: number) => void;
  setTranscriptScale: (v: number) => void;
  setGlassOpacity: (v: number) => void;
  setTranslateEnabled: (v: boolean) => void;
  setTargetLanguage: (l: LanguageCode) => void;
  setAutoSummarizeOnFinish: (v: boolean) => void;
  setChatCollapsed: (v: boolean) => void;
}

/** Bounds for the appearance sliders, also used to clamp persisted values. */
export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 1.4;
export const TRANSCRIPT_SCALE_MIN = 0.8;
export const TRANSCRIPT_SCALE_MAX = 1.6;
export const GLASS_OPACITY_MIN = 0.15;
export const GLASS_OPACITY_MAX = 0.95;

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set) => ({
      language: 'multi',
      systemOnly: false,
      inputDevice: null,
      outputDevice: null,
      videoEnabled: false,
      videoWindowId: null,
      uiScale: 1,
      transcriptScale: 1,
      glassOpacity: 0.58,
      translateEnabled: false,
      targetLanguage: 'en',
      autoSummarizeOnFinish: true,
      chatCollapsed: false,
      setLanguage: (language) => set({ language }),
      setSystemOnly: (systemOnly) => set({ systemOnly }),
      setInputDevice: (inputDevice) => set({ inputDevice }),
      setOutputDevice: (outputDevice) => set({ outputDevice }),
      setVideoEnabled: (videoEnabled) => set({ videoEnabled }),
      setVideoWindowId: (videoWindowId) => set({ videoWindowId }),
      setUiScale: (uiScale) => set({ uiScale }),
      setTranscriptScale: (transcriptScale) => set({ transcriptScale }),
      setGlassOpacity: (glassOpacity) => set({ glassOpacity }),
      setTranslateEnabled: (translateEnabled) => set({ translateEnabled }),
      setTargetLanguage: (targetLanguage) => set({ targetLanguage }),
      setAutoSummarizeOnFinish: (autoSummarizeOnFinish) => set({ autoSummarizeOnFinish }),
      setChatCollapsed: (chatCollapsed) => set({ chatCollapsed }),
    }),
    {
      name: 'sososo-config',
      // Persist the appearance prefs + translation choice; language/systemOnly
      // stay in-memory (they're already synced to the backend separately).
      partialize: (s) => ({
        uiScale: s.uiScale,
        transcriptScale: s.transcriptScale,
        glassOpacity: s.glassOpacity,
        translateEnabled: s.translateEnabled,
        targetLanguage: s.targetLanguage,
        autoSummarizeOnFinish: s.autoSummarizeOnFinish,
        chatCollapsed: s.chatCollapsed,
        videoEnabled: s.videoEnabled,
      }),
    },
  ),
);
