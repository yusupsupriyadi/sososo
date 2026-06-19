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
    id: 'openai-compatible',
    label: 'OpenAI Compatible (custom endpoint)',
    placeholder: 'sk-…',
    keysUrl: 'https://openrouter.ai/keys',
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

/** Suggested model names per provider for the Settings model field. These are
 *  hints only — the field is free-text, so any model the provider accepts works.
 *  The first entry of each list mirrors the Rust `Provider::default_model`. Model
 *  lineups change often; update freely. */
export const MODEL_SUGGESTIONS: Record<AiProvider, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini'],
  'openai-compatible': [
    'openai/gpt-4o-mini',
    'anthropic/claude-haiku-4-5',
    'deepseek/deepseek-chat',
    'qwen/qwen-2.5-72b-instruct',
    'meta-llama/llama-3.1-70b-instruct',
  ],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-8'],
  glm: ['glm-4.6', 'glm-4.5', 'glm-4-flash'],
  kimi: ['kimi-k2.5', 'kimi-k2.6', 'moonshot-v1-8k'],
  grok: ['grok-4', 'grok-3', 'grok-3-fast'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-flash'],
  llama: ['llama3.1', 'llama3.2', 'qwen2.5', 'mistral', 'phi3'],
};
