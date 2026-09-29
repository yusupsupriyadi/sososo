import { describe, expect, test } from 'bun:test';

import { nextTheme, resolveTheme } from './theme';

describe('resolveTheme', () => {
  test('a stored choice wins over the OS preference', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  test('falls back to the OS preference', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  test('ignores garbage in storage', () => {
    expect(resolveTheme('sepia', true)).toBe('dark');
    expect(resolveTheme('', false)).toBe('light');
  });
});

describe('nextTheme', () => {
  test('toggles between light and dark', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });
});
