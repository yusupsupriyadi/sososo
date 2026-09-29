import { gsap } from 'gsap';

import { RingField, type Pocket } from './field';
import type { DemoSource } from './lib/demo';
import { VoiceLevel } from './listen';

interface Point {
  x: number;
  y: number;
}

export interface HeroScene {
  /** A caption landed: the call's emitter rings for remote speakers, yours for you. */
  pulse(source: DemoSource): void;
}

/** Hero: one emitter sits behind the widget (the call), one trails your pointer (you). */
export function mountHeroField(still: boolean): HeroScene | null {
  const hero = document.getElementById('hero');
  const canvas = document.getElementById('hero-field') as HTMLCanvasElement | null;
  const panel = document.querySelector<HTMLElement>('.js-widget-panel');
  const copy = document.getElementById('hero-copy');
  if (!hero || !canvas || !panel || !copy) return null;

  const call: Point = { x: 0, y: 0 };
  const home: Point = { x: 0, y: 0 };
  const you: Point = { x: 0, y: 0 };
  let pocket: Pocket = { x0: 0, y0: 0, x1: 0, y1: 0 };
  let halo: Pocket = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const figure = document.getElementById('hero-widget');
  let pointer: Point | null = null;

  const measure = () => {
    const c = canvas.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const k = copy.getBoundingClientRect();
    call.x = p.left - c.left + p.width / 2;
    call.y = p.top - c.top + p.height / 2;
    home.x = Math.max(40, call.x - p.width * 0.62);
    home.y = Math.min(c.height - 40, call.y + p.height * 0.62);
    const f = (figure ?? panel).getBoundingClientRect();
    halo = {
      x0: f.left - c.left - 8,
      y0: f.top - c.top - 8,
      x1: f.right - c.left + 8,
      y1: f.bottom - c.top + 8,
    };
    pocket = {
      x0: k.left - c.left - 28,
      y0: k.top - c.top - 28,
      x1: k.right - c.left + 28,
      y1: k.bottom - c.top + 28,
    };
    if (!you.x) Object.assign(you, home);
  };
  measure();
  const field = RingField.create(canvas, {
    emitters: () => [
      { ...call, scale: 1, gap: 0 },
      { ...you, scale: 0.72, gap: 0 },
    ],
    pocket: () => pocket,
    pocketSoft: 110,
    halo: () => halo,
    haloSoft: 90,
    haloFloor: 0.3,
    spacing: 24,
    dot: 12,
    falloff: 0.66,
    edge: 70,
    strength: { light: 0.82, dark: 0.44 },
    palette: 'page',
    still,
  });
  if (!field) return null;
  const remeasure = () => {
    measure();
    field.refresh();
  };
  new ResizeObserver(remeasure).observe(hero);
  void document.fonts.ready.then(remeasure);

  const voice = VoiceLevel.supported() && !still ? new VoiceLevel() : null;
  const meter = Array.from(document.querySelectorAll<HTMLElement>('#listen .js-meter i'));

  if (!still) {
    hero.addEventListener('pointermove', (e) => {
      const c = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - c.left, y: e.clientY - c.top };
    });
    hero.addEventListener('pointerleave', () => (pointer = null));

    gsap.ticker.add((time) => {
      const target = pointer ?? {
        x: home.x + Math.sin(time * 0.35) * 36,
        y: home.y + Math.cos(time * 0.27) * 24,
      };
      you.x += (target.x - you.x) * 0.08;
      you.y += (target.y - you.y) * 0.08;

      if (voice?.active) {
        const { level, onset } = voice.read();
        field.setAmp(level);
        meter.forEach((bar, i) => {
          bar.style.transform = `scaleY(${Math.max(0.2, Math.min(1, level * (1.4 - i * 0.18)))})`;
        });
        if (onset) field.pulse(you.x, you.y);
      }
    });
  }

  if (voice) wireListen(voice, field);

  return {
    pulse: (source) => (source === 'you' ? field.pulse(you.x, you.y) : field.pulse(call.x, call.y)),
  };
}

function wireListen(voice: VoiceLevel, field: RingField): void {
  const box = document.getElementById('listen');
  const btn = document.getElementById('btn-listen');
  const label = btn?.querySelector('.js-listen-label');
  const meter = btn?.querySelector('.js-meter');
  const status = document.getElementById('listen-status');
  if (!box || !btn || !label || !meter || !status) return;

  const idleText = status.textContent?.trim() ?? '';
  box.classList.remove('hidden');
  box.classList.add('flex');

  const setUi = (on: boolean) => {
    btn.setAttribute('aria-pressed', String(on));
    label.textContent = on ? 'Stop listening' : 'Let the rings hear you';
    meter.classList.toggle('hidden', !on);
    meter.classList.toggle('flex', on);
  };

  const stop = () => {
    voice.stop();
    field.setAmp(0);
    setUi(false);
  };

  btn.addEventListener('click', async () => {
    if (voice.active) {
      stop();
      status.textContent = idleText;
      return;
    }
    status.textContent = 'Asking for your microphone…';
    const err = await voice.start();
    if (err === 'blocked') {
      status.textContent = 'Microphone access was blocked, so the rings keep their own rhythm.';
    } else if (err) {
      status.textContent = 'No microphone was found, so the rings keep their own rhythm.';
    } else {
      setUi(true);
      status.textContent = 'Listening in this tab only. Speak and watch the rings.';
    }
  });

  // never keep the mic open in a tab nobody is looking at
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && voice.active) {
      stop();
      status.textContent = idleText;
    }
  });
}

// Pixel measurements of sososo_brand_logo_white-bg-transparent.png (941 × 265).
const WORDMARK_O = { xs: [0.255, 0.568, 0.881], y: 0.4981, radius: 0.0829 };

/** Finale: the three O's of the wordmark broadcast into the ink. */
export function mountFinaleField(still: boolean): void {
  const canvas = document.getElementById('footer-field') as HTMLCanvasElement | null;
  const mark = document.querySelector<HTMLImageElement>('.js-big-wordmark');
  if (!canvas || !mark) return;

  let centres: { x: number; y: number; gap: number }[] = [];
  const measure = () => {
    const c = canvas.getBoundingClientRect();
    const m = mark.getBoundingClientRect();
    centres = WORDMARK_O.xs.map((fx) => ({
      x: m.left - c.left + m.width * fx,
      y: m.top - c.top + m.height * WORDMARK_O.y,
      gap: m.width * WORDMARK_O.radius + 3,
    }));
  };
  measure();
  const field = RingField.create(canvas, {
    emitters: () => centres.map((o) => ({ ...o, scale: 1 })),
    spacing: 18,
    falloff: 0.5,
    edge: 110,
    strength: { light: 0.2, dark: 0.2 },
    palette: 'stage',
    still,
  });
  const remeasure = () => {
    measure();
    field?.refresh();
  };
  new ResizeObserver(remeasure).observe(canvas);
  mark.addEventListener('load', remeasure);
}
