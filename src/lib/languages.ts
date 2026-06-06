// Languages supported by Deepgram Nova-3 (live/streaming). Every option runs on
// the Nova-3 model in the backend. `multi` = multilingual auto-detect
// (code-switching). List follows Deepgram's Models & Languages Overview,
// including regional variants.
// Source: https://developers.deepgram.com/docs/models-languages-overview

export interface LanguageOption {
  /** BCP-47 code sent to Deepgram (e.g. "id", "en-US", "multi"). */
  code: string;
  /** Display label for the UI. */
  label: string;
}

// `multi` then `id` pinned on top (this app's primary use case); the rest grouped
// by language with regional variants kept adjacent.
export const LANGUAGES: LanguageOption[] = [
  { code: "multi", label: "Auto-detect (multilingual)" },
  { code: "id", label: "Indonesian" },

  // Arabic + regional variants
  { code: "ar", label: "Arabic" },
  { code: "ar-SA", label: "Arabic (Saudi Arabia)" },
  { code: "ar-AE", label: "Arabic (UAE)" },
  { code: "ar-EG", label: "Arabic (Egypt)" },
  { code: "ar-QA", label: "Arabic (Qatar)" },
  { code: "ar-KW", label: "Arabic (Kuwait)" },
  { code: "ar-SY", label: "Arabic (Syria)" },
  { code: "ar-LB", label: "Arabic (Lebanon)" },
  { code: "ar-PS", label: "Arabic (Palestine)" },
  { code: "ar-JO", label: "Arabic (Jordan)" },
  { code: "ar-SD", label: "Arabic (Sudan)" },
  { code: "ar-TD", label: "Arabic (Chad)" },
  { code: "ar-MA", label: "Arabic (Morocco)" },
  { code: "ar-DZ", label: "Arabic (Algeria)" },
  { code: "ar-TN", label: "Arabic (Tunisia)" },
  { code: "ar-IQ", label: "Arabic (Iraq)" },
  { code: "ar-IR", label: "Arabic (Iran)" },

  { code: "nl", label: "Dutch" },
  { code: "nl-BE", label: "Dutch (Belgium) / Flemish" },
  { code: "be", label: "Belarusian" },
  { code: "bn", label: "Bengali" },
  { code: "bs", label: "Bosnian" },
  { code: "bg", label: "Bulgarian" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "et", label: "Estonian" },
  { code: "fi", label: "Finnish" },
  { code: "gu", label: "Gujarati" },
  { code: "hi", label: "Hindi" },
  { code: "hu", label: "Hungarian" },
  { code: "he", label: "Hebrew" },

  // English + regional variants
  { code: "en", label: "English" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-AU", label: "English (Australia)" },
  { code: "en-IN", label: "English (India)" },
  { code: "en-NZ", label: "English (New Zealand)" },

  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "de", label: "German" },
  { code: "de-CH", label: "German (Switzerland)" },
  { code: "kn", label: "Kannada" },
  { code: "zh-HK", label: "Cantonese (Hong Kong)" },
  { code: "ca", label: "Catalan" },
  { code: "ko", label: "Korean" },
  { code: "hr", label: "Croatian" },
  { code: "lv", label: "Latvian" },
  { code: "lt", label: "Lithuanian" },
  { code: "mk", label: "Macedonian" },

  // Mandarin
  { code: "zh", label: "Mandarin (China)" },
  { code: "zh-TW", label: "Mandarin (Traditional)" },

  { code: "mr", label: "Marathi" },
  { code: "ms", label: "Malay" },
  { code: "no", label: "Norwegian" },
  { code: "fa", label: "Persian" },
  { code: "pl", label: "Polish" },

  // Portuguese
  { code: "pt", label: "Portuguese" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "pt-PT", label: "Portuguese (Portugal)" },

  // French
  { code: "fr", label: "French" },
  { code: "fr-CA", label: "French (Canada)" },

  { code: "ro", label: "Romanian" },
  { code: "ru", label: "Russian" },
  { code: "sr", label: "Serbian" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },

  // Spanish
  { code: "es", label: "Spanish" },
  { code: "es-419", label: "Spanish (Latin America)" },

  { code: "sv", label: "Swedish" },
  { code: "tl", label: "Tagalog" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "th", label: "Thai" },
  { code: "tr", label: "Turkish" },
  { code: "uk", label: "Ukrainian" },
  { code: "ur", label: "Urdu" },
  { code: "vi", label: "Vietnamese" },
  { code: "el", label: "Greek" },
];

/** Look up the display label for a language code (falls back to the code itself). */
export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
