// Pure helpers for the page-long "call": the nav clock maps scroll to call time,
// and the two-input tracks draw seeded waveforms (same shape on every load).

export interface ClockStop {
  /** Scroll position (px) where this moment of the call is reached. */
  at: number;
  seconds: number;
}

export function callSeconds(scroll: number, stops: readonly ClockStop[]): number {
  if (stops.length === 0) return 0;
  if (scroll <= stops[0].at) return stops[0].seconds;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (scroll <= b.at) {
      const k = (scroll - a.at) / (b.at - a.at || 1);
      return Math.round(a.seconds + (b.seconds - a.seconds) * k);
    }
  }
  return stops[stops.length - 1].seconds;
}

export function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** mulberry32: a tiny seeded PRNG, so waveforms never depend on Math.random. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bar heights in (0, 1] for one spoken phrase: noisy, smoothed, quiet at both ends. */
export function waveHeights(count: number, seed: number): number[] {
  const rand = seeded(seed);
  const raw = Array.from({ length: count }, () => rand());
  return raw.map((_, i) => {
    const prev = raw[Math.max(0, i - 1)];
    const next = raw[Math.min(count - 1, i + 1)];
    const smooth = (prev + raw[i] * 2 + next) / 4;
    const envelope = Math.sin((Math.PI * (i + 0.5)) / count) ** 0.7;
    return Math.min(1, Math.max(0.08, envelope * (0.3 + 0.7 * smooth)));
  });
}
