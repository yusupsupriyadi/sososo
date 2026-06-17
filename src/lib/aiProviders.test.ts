import { describe, expect, test } from 'bun:test';
import { AI_PROVIDERS, PROVIDER_OPTIONS } from './aiProviders';
import type { AiProvider } from '../types/domain';

// AI_PROVIDERS drives the Settings AI-key inputs (cloud providers with keys);
// PROVIDER_OPTIONS drives the active-provider dropdown (cloud + local Llama).
const EXPECTED_IDS: AiProvider[] = [
  'openai',
  'gemini',
  'anthropic',
  'glm',
  'kimi',
  'grok',
  'deepseek',
];

describe('AI_PROVIDERS', () => {
  test('lists every provider exactly once, in a stable order', () => {
    expect(AI_PROVIDERS.map((p) => p.id)).toEqual(EXPECTED_IDS);
  });

  test('ids are unique', () => {
    const ids = AI_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every provider has a label, placeholder, and an https keys URL', () => {
    for (const p of AI_PROVIDERS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.placeholder.length).toBeGreaterThan(0);
      expect(p.keysUrl.startsWith('https://')).toBe(true);
    }
  });
});

describe('PROVIDER_OPTIONS', () => {
  test('lists every keyed provider plus local Llama, in a stable order', () => {
    expect(PROVIDER_OPTIONS.map((p) => p.id)).toEqual([...EXPECTED_IDS, 'llama']);
  });

  test('includes the local Llama option that is absent from the key list', () => {
    expect(AI_PROVIDERS.map((p) => p.id)).not.toContain('llama');
    const llama = PROVIDER_OPTIONS.find((p) => p.id === 'llama');
    expect(llama?.label.length ?? 0).toBeGreaterThan(0);
  });
});
