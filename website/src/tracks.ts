import { waveHeights } from './lib/timeline';

const TONE: Record<string, string> = {
  'speaker-1': 'bg-speaker-1',
  'speaker-2': 'bg-speaker-2',
  you: 'bg-you',
};

/** Fills each .track-bar with a dim and a lit waveform; motion.ts clips the lit one. */
export function buildWaves(root: HTMLElement): void {
  const bars = Array.from(root.querySelectorAll<HTMLElement>('.track-bar'));
  let lastWidth = -1;

  const draw = () => {
    const width = root.clientWidth;
    if (width === lastWidth) return;
    lastWidth = width;
    bars.forEach((bar, i) => {
      const heights = waveHeights(Math.max(4, Math.floor(bar.clientWidth / 5)), i * 7 + 3);
      const tone = TONE[bar.dataset.tone ?? ''] ?? TONE.you;
      const layer = (cls: string) => {
        const wave = document.createElement('span');
        wave.className = `wave ${cls}`;
        for (const h of heights) {
          const b = document.createElement('i');
          b.className = tone;
          b.style.height = `${Math.round(h * 100)}%`;
          wave.append(b);
        }
        return wave;
      };
      const lit = layer('wave-lit');
      lit.style.clipPath = bar.dataset.fill ?? 'none';
      bar.replaceChildren(layer('wave-dim'), lit);
    });
  };

  draw();
  new ResizeObserver(draw).observe(root);
}
