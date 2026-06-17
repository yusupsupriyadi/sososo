import type { AiProvider } from '../types/domain';

/** Display metadata for one AI provider, used by Settings to render its API-key
 *  input and the active-provider dropdown. Mirrors the Rust `ai::Provider`. */
export interface AiProviderInfo {
  /** Keychain service id + persisted `ai_provider` value. */
  id: AiProvider;
  /** Human-readable name (matches the Rust `Provider::label`). */
  label: string;
  /** Placeholder shown in the (empty) API-key input. */
  placeholder: string;
  /** Where to obtain an API key (opened in the system browser). */
  keysUrl: string;
}

/** All AI providers, in display order. Single source of truth for the Settings
 *  AI-key list and the provider dropdown — keep in lockstep with `AiProvider`
 *  and the Rust `ai::Provider` enum. */
export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    placeholder: 'sk-…',
    keysUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    placeholder: 'AIza…',
    keysUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    placeholder: 'sk-ant-…',
    keysUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'glm',
    label: 'GLM (Zhipu AI)',
    placeholder: 'API key…',
    keysUrl: 'https://z.ai/manage-apikey/apikey-list',
  },
  {
    id: 'kimi',
    label: 'Kimi (Moonshot)',
    placeholder: 'sk-…',
    keysUrl: 'https://platform.moonshot.ai/console/api-keys',
  },
  {
    id: 'grok',
    label: 'Grok (xAI)',
    placeholder: 'xai-…',
    keysUrl: 'https://console.x.ai',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    placeholder: 'sk-…',
    keysUrl: 'https://platform.deepseek.com/api_keys',
  },
];

/** One selectable provider in the active-provider dropdown. */
export interface ProviderOption {
  id: AiProvider;
  label: string;
}

/** The local-Llama option — a local OpenAI-compatible server (Ollama / LM Studio
 *  / llama.cpp). It has no cloud API key, so it is absent from `AI_PROVIDERS`;
 *  it's configured by base URL + model instead (see `getLlamaConfig`). */
export const LLAMA_LOCAL: ProviderOption = { id: 'llama', label: 'Llama (local)' };

/** All selectable providers for the active-provider dropdown: the keyed cloud
 *  providers plus local Llama. */
export const PROVIDER_OPTIONS: ProviderOption[] = [
  ...AI_PROVIDERS.map(({ id, label }) => ({ id, label })),
  LLAMA_LOCAL,
];
