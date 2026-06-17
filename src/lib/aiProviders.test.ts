import { describe, expect, test } from 'bun:test';
import { AI_PROVIDERS } from './aiProviders';
import type { AiProvider } from '../types/domain';

// The list drives both the Settings AI-key inputs and the provider dropdown, so
// it must stay in lockstep with the `AiProvider` union (and the Rust enum).
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
