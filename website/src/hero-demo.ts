import { gsap } from 'gsap';

import {
  DEMO_DURATION,
  DEMO_LINES,
  DEMO_SUMMARY,
  FINISH_AT,
  SUMMARY_AT,
  demoFrame,
  formatClock,
  type DemoFrame,
  type DemoPhase,
  type DemoSource,
} from './lib/demo';

const SPEAKER_COLOR: Record<string, string> = {
  You: 'text-you',
  'Speaker 1': 'text-speaker-1',
  'Speaker 2': 'text-speaker-2',
};

const MIC_ICON =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const SPEAKER_ICON =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>';

interface LineNode {
  root: HTMLDivElement;
  text: HTMLSpanElement;
  translation: HTMLSpanElement;
  shown: number;
}

interface HeroDemoOptions {
  /** Hold a finished, readable frame instead of looping. */
  still: boolean;
  /** Fired each time a caption line settles, with who said it. */
  onLineFinal?: (source: DemoSource) => void;
}

function status(phase: DemoPhase, paused: boolean): { label: string; dot: string } {
  if (phase === 'connecting') return { label: 'Connecting…', dot: 'connecting' };
  if (phase === 'finishing') return { label: 'Finishing…', dot: 'finishing' };
  if (phase === 'finished') return { label: 'Finished', dot: 'idle' };
  return paused ? { label: 'Paused', dot: 'idle' } : { label: 'Recording', dot: 'live' };
}

function buildSummary(): HTMLElement {
  // AI Summary block from SessionDetailRoute.tsx
  const box = document.createElement('section');
  box.className =
    'rounded-[12px] border border-app-border bg-[rgba(110,168,254,0.07)] px-4 py-3.5 text-[13px] leading-[1.5]';

  const title = document.createElement('p');
  title.className = 'text-[12px] tracking-[0.06em] text-you uppercase';
  title.textContent = 'AI Summary';

  const pointsTitle = document.createElement('p');
  pointsTitle.className = 'mt-2.5 font-semibold text-app-fg';
  pointsTitle.textContent = 'Key points';

  const points = document.createElement('ul');
  points.className = 'mt-1 list-disc space-y-0.5 pl-4 text-app-dim';
  for (const point of DEMO_SUMMARY.points) {
    const li = document.createElement('li');
    li.textContent = point;
    points.append(li);
  }

  const actionTitle = document.createElement('p');
  actionTitle.className = 'mt-2.5 font-semibold text-app-fg';
  actionTitle.textContent = 'Action items';

  const action = document.createElement('p');
  action.className = 'mt-1 text-app-dim';
  action.textContent = DEMO_SUMMARY.action;

  box.append(title, pointsTitle, points, actionTitle, action);
  return box;
}

export function mountHeroDemo({ still, onLineFinal }: HeroDemoOptions): void {
  const widget = document.getElementById('hero-widget');
  const body = document.getElementById('demo-body');
  const dot = document.getElementById('demo-dot');
  const statusEl = document.getElementById('demo-status');
  const clockEl = document.getElementById('demo-clock');
  const translateRow = document.getElementById('demo-translate-row');
  const pauseBtn = document.getElementById('demo-pause');
  const finishBtn = document.getElementById('demo-finish');
  const translateBtn = document.getElementById('demo-translate');
  if (
    !widget ||
    !body ||
    !dot ||
    !statusEl ||
    !clockEl ||
    !translateRow ||
    !pauseBtn ||
    !finishBtn ||
    !translateBtn
  ) {
    return;
  }

  const nodes = new Map<number, LineNode>();
  const summary = buildSummary();
  let userPaused = false;
  let onScreen = true;
  let translateFrom: number | null = null;
  let finalCount = 0;

  function lineNode(index: number): LineNode {
    const existing = nodes.get(index);
    if (existing) return existing;

    const line = DEMO_LINES[index];
    const root = document.createElement('div');
    root.className = 'flex flex-col gap-0.5';

    const label = document.createElement('span');
    label.className = `speaker ${SPEAKER_COLOR[line.speaker] ?? 'text-speaker-1'}`;
    label.innerHTML = line.source === 'you' ? MIC_ICON : SPEAKER_ICON;
    label.append(line.speaker);

    const text = document.createElement('span');
    text.className = 'caption-text is-interim';

    const translation = document.createElement('span');
    translation.className = 'translation-line';
    translation.hidden = true;

    root.append(label, text, translation);
    body!.append(root);
    const node = { root, text, translation, shown: -1 };
    nodes.set(index, node);
    return node;
  }

  function render(frame: DemoFrame): void {
    const s = status(frame.phase, userPaused);
    statusEl!.textContent = s.label;
    dot!.dataset.state = s.dot;
    clockEl!.textContent = formatClock(frame.elapsed);

    if (frame.phase === 'finished') {
      if (!summary.isConnected) {
        body!.replaceChildren(summary);
        nodes.clear();
        if (!still)
          gsap.fromTo(summary, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5 });
      }
      finishBtn!.setAttribute('aria-label', 'Start the demo call again');
      return;
    }
    if (summary.isConnected) summary.remove();
    finishBtn!.setAttribute('aria-label', 'Finish the call and show the summary');

    const visible = new Set(frame.lines.map((l) => l.index));
    for (const [index, node] of nodes) {
      if (!visible.has(index)) {
        node.root.remove();
        nodes.delete(index);
      }
    }

    let finals = 0;
    let lastFinal = -1;
    for (const line of frame.lines) {
      const node = lineNode(line.index);
      if (node.shown !== line.words) {
        node.text.textContent = DEMO_LINES[line.index].text
          .split(' ')
          .slice(0, line.words)
          .join(' ');
        node.shown = line.words;
      }
      node.text.classList.toggle('is-interim', !line.final);
      if (line.final) {
        finals += 1;
        lastFinal = line.index;
      }

      const tr = node.translation;
      tr.hidden = line.translation === 'none';
      tr.classList.toggle('is-pending', line.translation === 'pending');
      const trText =
        line.translation === 'pending' ? 'Translating…' : DEMO_LINES[line.index].translation;
      if (tr.textContent !== trText) tr.textContent = trText;
    }

    if (finals > finalCount && lastFinal >= 0) onLineFinal?.(DEMO_LINES[lastFinal].source);
    finalCount = finals;
  }

  function setTranslate(on: boolean, at: number): void {
    translateFrom = on ? at : null;
    translateBtn!.setAttribute('aria-pressed', String(on));
    translateBtn!.classList.toggle('bg-[rgba(110,168,254,0.9)]', on);
    translateBtn!.classList.toggle('text-white', on);
    translateBtn!.classList.toggle('bg-white/8', !on);
    translateBtn!.classList.toggle('text-app-faint', !on);
    translateRow!.classList.toggle('hidden', !on);
    translateRow!.classList.toggle('flex', on);
  }

  function setPausedUi(paused: boolean): void {
    pauseBtn!.setAttribute('aria-pressed', String(paused));
    pauseBtn!.setAttribute('aria-label', paused ? 'Resume the demo' : 'Pause the demo');
    pauseBtn!.querySelector('.js-icon-pause')?.classList.toggle('hidden', paused);
    pauseBtn!.querySelector('.js-icon-play')?.classList.toggle('hidden', !paused);
  }

  // Reduced motion: one readable frame, the controls still work on it.
  if (still) {
    let t = FINISH_AT - 0.01;
    const draw = () => {
      const frame = demoFrame(t, translateFrom);
      // no clock is running, so pending translations would never resolve
      frame.lines.forEach((l) => {
        if (l.translation === 'pending') l.translation = 'done';
      });
      render(frame);
    };
    userPaused = false;
    draw();
    pauseBtn.addEventListener('click', () => {
      userPaused = !userPaused;
      setPausedUi(userPaused);
      draw();
    });
    finishBtn.addEventListener('click', () => {
      t = t >= SUMMARY_AT ? FINISH_AT - 0.01 : SUMMARY_AT;
      draw();
    });
    translateBtn.addEventListener('click', () => {
      setTranslate(translateFrom === null, 0);
      draw();
    });
    return;
  }

  // One looping clock; pause, finish and translate are all seeks on it.
  const clock = gsap.to(
    {},
    {
      duration: DEMO_DURATION,
      ease: 'none',
      repeat: -1,
      paused: true,
      onUpdate: () => render(demoFrame(clock.time(), translateFrom)),
      onRepeat: () => {
        finalCount = 0;
        if (translateFrom !== null) translateFrom = 0;
      },
    },
  );

  const sync = () => {
    if (userPaused || !onScreen) clock.pause();
    else clock.play();
    render(demoFrame(clock.time(), translateFrom));
  };

  pauseBtn.addEventListener('click', () => {
    userPaused = !userPaused;
    setPausedUi(userPaused);
    sync();
  });

  finishBtn.addEventListener('click', () => {
    if (clock.time() >= SUMMARY_AT) {
      clock.time(0);
      finalCount = 0;
      if (translateFrom !== null) translateFrom = 0;
    } else {
      clock.time(SUMMARY_AT);
    }
    sync();
  });

  translateBtn.addEventListener('click', () => {
    setTranslate(translateFrom === null, clock.time());
    sync();
  });

  // Don't run the loop while nobody can see it.
  new IntersectionObserver(
    ([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    },
    { threshold: 0.1 },
  ).observe(widget);

  sync();
}
