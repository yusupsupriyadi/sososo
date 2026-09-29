import { describe, expect, test } from 'bun:test';

import { callSeconds, formatTimecode, waveHeights } from './timeline';

const STOPS = [
  { at: 1000, seconds: 0 },
  { at: 2000, seconds: 42 },
  { at: 4000, seconds: 750 },
];

describe('callSeconds', () => {
  test('holds at zero before the first stop', () => {
    expect(callSeconds(0, STOPS)).toBe(0);
    expect(callSeconds(1000, STOPS)).toBe(0);
  });

  test('interpolates between stops', () => {
    expect(callSeconds(1500, STOPS)).toBe(21);
    expect(callSeconds(3000, STOPS)).toBe(396);
  });

  test('holds at the last stop afterwards', () => {
    expect(callSeconds(9999, STOPS)).toBe(750);
  });

  test('returns whole seconds', () => {
    expect(Number.isInteger(callSeconds(1234, STOPS))).toBe(true);
  });

  test('copes with an empty or single-stop list', () => {
    expect(callSeconds(500, [])).toBe(0);
    expect(callSeconds(500, [{ at: 100, seconds: 30 }])).toBe(30);
  });
});

describe('formatTimecode', () => {
  test('formats as hh:mm:ss', () => {
    expect(formatTimecode(0)).toBe('00:00:00');
    expect(formatTimecode(42)).toBe('00:00:42');
    expect(formatTimecode(2830)).toBe('00:47:10');
    expect(formatTimecode(3725)).toBe('01:02:05');
  });
});

describe('waveHeights', () => {
  test('is deterministic for a seed', () => {
    expect(waveHeights(40, 7)).toEqual(waveHeights(40, 7));
  });

  test('differs between seeds', () => {
    expect(waveHeights(40, 7)).not.toEqual(waveHeights(40, 8));
  });

  test('returns the requested count within (0, 1]', () => {
    const h = waveHeights(64, 3);
    expect(h).toHaveLength(64);
    for (const v of h) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('tapers at both ends like a spoken phrase', () => {
    const h = waveHeights(50, 11);
    const mid = Math.max(...h.slice(15, 35));
    expect(h[0]).toBeLessThan(mid);
    expect(h[h.length - 1]).toBeLessThan(mid);
  });
});
