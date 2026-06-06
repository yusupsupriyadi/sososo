import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  /** Whole-UI zoom multiplier (CSS zoom). 1 = 100%. */
  uiScale: number;
  /** Font multiplier for transcript text + speaker labels (live + history). 1 = 100%. */
  transcriptScale: number;
  setLanguage: (l: LanguageCode) => void;
  setSystemOnly: (s: boolean) => void;
  setInputDevice: (id: string | null) => void;
  setOutputDevice: (id: string | null) => void;
  setUiScale: (v: number) => void;
  setTranscriptScale: (v: number) => void;
}

/** Bounds for the appearance sliders, also used to clamp persisted values. */
export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 1.4;
export const TRANSCRIPT_SCALE_MIN = 0.8;
export const TRANSCRIPT_SCALE_MAX = 1.6;

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set) => ({
      language: "multi",
      systemOnly: false,
      inputDevice: null,
      outputDevice: null,
      uiScale: 1,
      transcriptScale: 1,
      setLanguage: (language) => set({ language }),
      setSystemOnly: (systemOnly) => set({ systemOnly }),
      setInputDevice: (inputDevice) => set({ inputDevice }),
      setOutputDevice: (outputDevice) => set({ outputDevice }),
      setUiScale: (uiScale) => set({ uiScale }),
      setTranscriptScale: (transcriptScale) => set({ transcriptScale }),
    }),
    {
      name: "sososo-config",
      // Only persist the appearance prefs; language/systemOnly stay in-memory
      // (they're already synced to the backend separately).
      partialize: (s) => ({
        uiScale: s.uiScale,
        transcriptScale: s.transcriptScale,
      }),
    },
  ),
);
