// Scroll choreography. Every scrubbed scene is a pure function of scroll
// progress, so scrolling back up plays it backwards exactly.
//
// Motion purposes, one line each:
// - caption settle (headings): the product's own interim → final behavior is the page's voice
// - record scene (pinned): the O is the record button; its dot becomes the nav's call clock
// - call clock: the whole page reads as one call, timed by the section timecodes
// - two inputs (pinned): words travel from each waveform into one transcript
// - live sentence (pinned): an interim word gets corrected before the line settles
// - after the call (pinned): the transcript folds into the summary, then the chat answers
// - picker, translations, privacy lines: play the real app flow once, as it comes into view

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

import { callSeconds, formatTimecode, type ClockStop } from './lib/timeline';

gsap.registerPlugin(ScrollTrigger, SplitText);

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeInOut = (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Pinned scenes sit just under the sticky nav, not behind it. */
const navHeight = () => document.getElementById('site-nav')?.offsetHeight ?? 68;

interface Scene {
  render(p: number): void;
  measure?(): void;
}

/** A heading arrives the way sososo writes a caption: word by word, dim and
 *  slanted like an interim line, then it settles upright once the sentence is done. */
function captionSettle(el: HTMLElement): gsap.core.Timeline {
  const split = SplitText.create(el, { type: 'words', wordsClass: 'cap-word' });
  const tl = gsap.timeline({ paused: true });
  // the container was hidden pre-paint (see index.html); the words take over from here
  gsap.set(el, { opacity: 1 });
  tl.fromTo(
    split.words,
    { opacity: 0, y: '0.22em', skewX: -10, filter: 'blur(6px)' },
    { opacity: 0.5, y: 0, filter: 'blur(0px)', duration: 0.34, ease: 'power3.out', stagger: 0.075 },
  ).to(
    split.words,
    {
      opacity: 1,
      skewX: 0,
      duration: 0.5,
      ease: 'power2.out',
      stagger: 0.02,
      clearProps: 'filter',
    },
    '>+0.12',
  );
  return tl;
}

function wireHeadings(onHeroSettled: () => void): void {
  for (const el of $$('[data-caption]')) {
    const tl = captionSettle(el);
    if (el.dataset.caption === 'load') {
      tl.eventCallback('onComplete', onHeroSettled);
      tl.play(0.001);
    } else {
      ScrollTrigger.create({ trigger: el, start: 'top 86%', once: true, onEnter: () => tl.play() });
    }
  }
}

function wireReveals(): void {
  // supporting copy stays calm: a plain fade, no travel
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 90%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, { opacity: 1, duration: 0.6, ease: 'power1.out', stagger: 0.08 }),
  });
}

/* Record scene: Ctrl+Alt+R, the dot turns red, flies to the nav, the camera goes through the O */

export const FLY = { start: 0.46, end: 0.6 };

function recordScene(): Scene | null {
  const pin = $('.js-start-pin');
  const o = $<SVGSVGElement>('.js-o');
  const dot = $<SVGCircleElement>('.js-o-dot');
  const pulse = $<SVGCircleElement>('.js-o-pulse');
  const copy = $('.js-start-copy');
  const keysRow = $('.js-start-keys');
  const status = $('.js-key-status');
  const fly = $('#rec-dot-fly');
  const clockDot = $('#call-clock .js-clock-dot');
  const keys = $$('.js-key');
  if (!pin || !o || !dot || !pulse || !copy || !keysRow || !status || !fly || !clockDot)
    return null;

  const depth = parseFloat(getComputedStyle(keys[0]).getPropertyValue('--depth')) || 8;
  let from = { x: 0, y: 0, size: 0 };
  let to: { x: number; y: number; size: number } | null = null;
  let last = 0;

  const render = (p: number) => {
    last = p;
    keys.forEach((key, i) => {
      const press = easeOut(span(p, 0.1 + i * 0.07, 0.14 + i * 0.07)) * (1 - span(p, 0.4, 0.44));
      gsap.set(key, { y: press * (depth - 2), '--depth': `${depth - press * (depth - 2)}px` });
    });

    const s = easeOut(span(p, 0.32, 0.38));
    gsap.set(status, { opacity: s, x: (1 - s) * -12 });

    const recording = p >= 0.3;
    dot.style.fill = recording ? '#ff5d5d' : '';
    dot.style.opacity = p < FLY.start ? '1' : '0';
    const pk = span(p, 0.3, 0.46);
    pulse.setAttribute('r', String(52 + pk * 170));
    pulse.style.opacity = pk > 0 && pk < 1 ? String(1 - pk) : '0';

    const flying = p >= FLY.start && p < FLY.end;
    fly.style.opacity = flying ? '1' : '0';
    if (flying) {
      const k = easeInOut(span(p, FLY.start, FLY.end));
      const end = to ?? { ...from, size: 0 };
      const size = lerp(from.size, end.size, k);
      const x = lerp(from.x, end.x, k);
      const y = lerp(from.y, end.y, k) - Math.sin(k * Math.PI) * 90;
      fly.style.width = fly.style.height = `${size}px`;
      fly.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`;
    }

    const push = span(p, 0.64, 1);
    gsap.set(o, { scale: 1 + push * push * 15, transformOrigin: '50% 50%' });
    const fade = 1 - span(p, 0.62, 0.72);
    gsap.set([copy, keysRow], { opacity: fade, y: (1 - fade) * -24 });
  };

  const measure = () => {
    const keep = last;
    render(0);
    const pr = pin.getBoundingClientRect();
    const dr = dot.getBoundingClientRect();
    // viewport position while pinned: the pin sits right under the nav
    from = {
      x: dr.left + dr.width / 2,
      y: dr.top - pr.top + navHeight() + dr.height / 2,
      size: dr.width,
    };
    const cr = clockDot.getBoundingClientRect();
    to = cr.width ? { x: cr.left + cr.width / 2, y: cr.top + cr.height / 2, size: cr.width } : null;
    render(keep);
  };

  return { render, measure };
}

/* Two inputs: waveforms fill under the playhead, words fly from the sound into the transcript */

function twoInputsScene(): Scene | null {
  const figure = $('#two-inputs');
  const playhead = figure && $('.js-playhead', figure);
  if (!figure || !playhead) return null;

  const tracks = new Map(
    $$('.js-track', figure).map((t) => [t.dataset.track ?? '', t] as [string, HTMLElement]),
  );
  const bars = $$<HTMLElement>('.track-bar', figure).map((bar) => ({
    bar,
    from: parseFloat(bar.style.left) / 100,
    width: parseFloat(bar.style.width) / 100,
  }));

  const lines = $$<HTMLElement>('.js-line', figure).map((li) => {
    const text = $('.caption-text', li)!;
    const words = text.textContent!.trim().split(/\s+/);
    text.replaceChildren(
      ...words.flatMap((w, i) => {
        const s = document.createElement('span');
        s.className = 'inline-block';
        s.textContent = w;
        return i === words.length - 1 ? [s] : [s, document.createTextNode(' ')];
      }),
    );
    const from = Number(li.dataset.from);
    const to = Number(li.dataset.to);
    return {
      li,
      text,
      track: li.dataset.track ?? 'system',
      from,
      to,
      words: $$('span', text).map((el, i, all) => ({
        el,
        at: from + ((to - from) * (i + 0.5)) / all.length,
        dx: 0,
        dy: 0,
      })),
    };
  });
  let last = 0;

  const render = (p: number) => {
    last = p;
    gsap.set(playhead, { xPercent: p * 100 });
    for (const b of bars) {
      const clip = `inset(0 ${(1 - clamp01((p - b.from) / b.width)) * 100}% 0 0)`;
      b.bar.dataset.fill = clip;
      const lit = $('.wave-lit', b.bar);
      if (lit) lit.style.clipPath = clip;
    }
    for (const line of lines) {
      const started = p >= line.from;
      const final = p >= line.to;
      line.li.style.opacity = started ? '1' : '0';
      line.text.classList.toggle('is-interim', started && !final);
      for (const w of line.words) {
        const e = easeOut(span(p, w.at, w.at + 0.05));
        w.el.style.opacity = String(e);
        w.el.style.transform =
          e >= 1
            ? ''
            : `translate(${w.dx * (1 - e)}px, ${w.dy * (1 - e)}px) scale(${0.55 + 0.45 * e})`;
      }
    }
  };

  const measure = () => {
    const f = figure.getBoundingClientRect();
    for (const line of lines) {
      const t = (tracks.get(line.track) ?? tracks.values().next().value)!.getBoundingClientRect();
      for (const w of line.words) {
        w.el.style.transform = '';
        const r = w.el.getBoundingClientRect();
        // where the playhead is on this word's track at the moment it is spoken
        const sx = t.left + t.width * w.at - f.left;
        const sy = t.top + t.height / 2 - f.top;
        w.dx = sx - (r.left + r.width / 2 - f.left);
        w.dy = sy - (r.top + r.height / 2 - f.top);
      }
    }
    render(last);
  };

  return { render, measure };
}

/** "Let's move the lunch" → "launch to Friday", then the line settles. */
function liveSentenceTimeline(): gsap.core.Timeline | null {
  const section = $('#live-captions');
  if (!section) return null;
  const words = $$('.live-sentence .lw', section).filter((w) => !w.classList.contains('js-right'));
  const wrong = $('.js-wrong', section);
  const right = $('.js-right', section);
  const label = $('.js-live-label', section);
  const dot = $('.js-live-dot', section);
  if (!wrong || !right || !label || !dot) return null;

  const showState = (final: boolean) => {
    label.textContent = final ? 'Final' : 'Interim';
    dot.style.backgroundColor = final ? '#f3f1ea' : '#a19e96';
  };
  // the markup ships the settled state for no-motion visitors; start from interim
  showState(false);
  const tl = gsap.timeline({ onUpdate: () => showState(tl.progress() >= 0.76) });
  // the slot starts as wide as the wrong word and grows as the correction lands,
  // so the words after it reflow the way a live caption does (em: resize-safe)
  const swap = wrong.parentElement!;
  const em = parseFloat(getComputedStyle(swap).fontSize);
  const wrongW = `${wrong.getBoundingClientRect().width / em}em`;
  const rightW = `${right.getBoundingClientRect().width / em}em`;

  const settled = [...words.filter((w) => w !== wrong), right];
  tl.set(words, { opacity: 0, y: 0, skewX: -10 })
    .set(right, { opacity: 0, skewX: -10, y: '0.25em' })
    .set(swap, { width: wrongW })
    .to(words, { opacity: 0.45, duration: 0.08, stagger: 0.07, ease: 'power2.out' }, 0.02)
    .to(wrong, { opacity: 0, y: '-0.25em', duration: 0.08, ease: 'power2.in' }, 0.56)
    .to(swap, { width: rightW, duration: 0.1, ease: 'power2.inOut' }, 0.56)
    .to(right, { opacity: 0.45, y: 0, duration: 0.08, ease: 'power2.out' }, 0.6)
    .to(settled, { opacity: 1, skewX: 0, duration: 0.1, stagger: 0.012 }, 0.74)
    .to({}, { duration: 0.1 });
  return tl;
}

/* After the call: transcript folds into the summary, then the chat answers */

export const FINISH_AT = 0.14;

function afterScene(): Scene | null {
  const chat = $('#transcript-chat');
  const transcript = chat && $('.js-beat-transcript', chat);
  const summary = chat && $('.js-beat-summary', chat);
  const thinking = chat && $('.js-chat-thinking', chat);
  if (!chat || !transcript || !summary || !thinking) return null;
  const folds = $$('.js-fold-line', transcript);
  const sums = $$('.js-sum', summary);
  const [q1, a1, q2, , a2] = $$('.js-chat', chat);

  return {
    render(p) {
      folds.forEach((line, i) => {
        const k = easeInOut(span(p, 0.04 + i * 0.03, 0.16 + i * 0.03));
        gsap.set(line, {
          y: -k * (16 + i * 10),
          scaleY: 1 - k * 0.7,
          opacity: 1 - k,
          transformOrigin: '50% 0%',
        });
      });
      const gone = span(p, 0.16, 0.22);
      transcript.style.opacity = String(1 - gone);
      transcript.style.visibility = gone >= 1 ? 'hidden' : 'visible';

      const reveal = easeOut(span(p, 0.22, 0.38));
      summary.style.clipPath = `inset(0 0 ${(1 - reveal) * 100}% 0 round 12px)`;
      sums.forEach((s, j) => {
        const e = easeOut(span(p, 0.26 + j * 0.022, 0.32 + j * 0.022));
        gsap.set(s, { opacity: e, y: (1 - e) * 6 });
      });

      const bubble = (el: HTMLElement | undefined, at: number) => {
        if (!el) return;
        const e = easeOut(span(p, at, at + 0.05));
        gsap.set(el, { opacity: e, y: (1 - e) * 10 });
      };
      bubble(q1, 0.42);
      bubble(a1, 0.52);
      bubble(q2, 0.62);
      thinking.classList.toggle('hidden', !(p >= 0.7 && p < 0.8));
      bubble(a2, 0.8);
    },
  };
}

/* Supporting scenes that play once */

function wirePicker(): void {
  const picker = $('#window-picker');
  if (!picker) return;
  const cards = $$('.js-pick', picker);
  const rec = $('.js-rec-row', picker);
  if (cards.length < 2 || !rec) return;

  cards.forEach((c) => c.classList.remove('is-picked'));
  gsap.set(rec, { opacity: 0, y: 12 });
  const tl = gsap.timeline({ paused: true });
  tl.call(() => cards[1].classList.add('is-picked'), [], 0.35)
    .call(() => cards[1].classList.remove('is-picked'), [], 0.95)
    .call(() => cards[0].classList.add('is-picked'), [], 1.0)
    .fromTo(
      $('.js-pick-check', cards[0]),
      { scale: 0.3 },
      { scale: 1, duration: 0.4, ease: 'back.out(3)' },
      1.0,
    )
    .to(rec, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 1.55);
  ScrollTrigger.create({ trigger: picker, start: 'top 70%', once: true, onEnter: () => tl.play() });
}

function wireTranslations(): void {
  const lines = $$('#languages .js-tr');
  if (!lines.length) return;
  gsap.set(lines, { opacity: 0, x: -8 });
  ScrollTrigger.create({
    trigger: lines[0],
    start: 'top 80%',
    once: true,
    onEnter: () =>
      gsap.to(lines, {
        opacity: 1,
        x: 0,
        duration: 0.5,
        stagger: 0.6,
        delay: 0.5,
        ease: 'power3.out',
      }),
  });
}

function wirePrivacyFlow(): void {
  for (const line of $$('.js-flow-line i')) {
    gsap.fromTo(
      line,
      { scaleX: 0 },
      {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: { trigger: line, start: 'top 85%', end: 'top 55%', scrub: true },
      },
    );
  }
}

function wireFinale(): void {
  const mark = $('.js-big-wordmark');
  if (!mark) return;
  gsap.fromTo(
    mark,
    { yPercent: 18, scale: 0.94 },
    {
      yPercent: 0,
      scale: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: '.js-finale',
        start: 'top bottom',
        end: 'bottom bottom',
        scrub: true,
      },
    },
  );
}

/** A scene scrubbed by scroll; pinned scenes hold the screen while they play. */
function scrub(
  scene: Scene,
  trigger: string,
  opts: { pin: boolean; end: string; start?: string },
): ScrollTrigger {
  const state = { p: 0 };
  const tween = gsap.to(state, {
    p: 1,
    ease: 'none',
    onUpdate: () => scene.render(state.p),
    scrollTrigger: {
      trigger,
      start: opts.start ?? (() => `top ${navHeight()}px`),
      end: opts.end,
      pin: opts.pin,
      scrub: 0.3,
      // pins refresh first so every trigger below them sees the added spacing
      refreshPriority: opts.pin ? 1 : 0,
    },
  });
  scene.render(0);
  return tween.scrollTrigger!;
}

function wireCallClock(marks: () => { show: number; finish: number; stops: ClockStop[] }): void {
  const clock = $('#call-clock');
  const hours = clock && $('.js-clock-h', clock);
  const rest = clock && $('.js-clock-ms', clock);
  if (!clock || !hours || !rest) return;
  let m = { show: Infinity, finish: Infinity, stops: [] as ClockStop[] };
  const update = () => {
    const y = window.scrollY;
    clock.classList.toggle('is-on', y >= m.show);
    clock.classList.toggle('is-finished', y >= m.finish);
    // phones show mm:ss only, so the nav keeps room for the menu
    const [h, ...ms] = formatTimecode(callSeconds(y, m.stops)).split(':');
    hours.textContent = `${h}:`;
    rest.textContent = ms.join(':');
  };
  ScrollTrigger.addEventListener('refresh', () => {
    m = marks();
    update();
  });
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: update });
}

export function initMotion(onHeroSettled: () => void): void {
  const lenis = new Lenis({ autoRaf: false, anchors: { offset: -76 } });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // `?debug` exposes the engine so a review can step time frame by frame
  // (background tabs throttle requestAnimationFrame to about 1 fps).
  if (/[?&]debug\b/.test(window.location.search)) {
    Object.assign(window, { gsap, ScrollTrigger, lenis });
  }

  wireHeadings(onHeroSettled);
  wireReveals();
  wirePicker();
  wireTranslations();
  wirePrivacyFlow();
  wireFinale();

  const record = recordScene();
  const inputs = twoInputsScene();
  const after = afterScene();
  let recordST: ScrollTrigger | null = null;
  let afterST: ScrollTrigger | null = null;

  const mm = gsap.matchMedia();
  mm.add(
    { wide: '(min-width: 1024px)', tall: '(min-height: 700px)', taller: '(min-height: 780px)' },
    (ctx) => {
      const { wide, tall, taller } = ctx.conditions as Record<string, boolean>;
      // created in page order: record, two inputs, live sentence, after the call
      if (record)
        recordST = scrub(record, '.js-start-pin', { pin: true, end: wide ? '+=240%' : '+=200%' });

      if (inputs) {
        if (wide && tall) scrub(inputs, '.js-captions-pin', { pin: true, end: '+=160%' });
        else scrub(inputs, '#two-inputs', { pin: false, start: 'top 75%', end: 'bottom 40%' });
      }

      const live = liveSentenceTimeline();
      if (live) {
        ScrollTrigger.create(
          wide && tall
            ? {
                animation: live,
                trigger: '.js-live-pin',
                start: () => `top ${navHeight()}px`,
                end: '+=130%',
                pin: true,
                scrub: 0.3,
                refreshPriority: 1,
              }
            : {
                animation: live,
                trigger: '.live-sentence',
                start: 'top 80%',
                end: 'bottom 35%',
                scrub: 0.3,
              },
        );
      }

      if (after) {
        afterST =
          wide && taller
            ? scrub(after, '.js-after-pin', { pin: true, end: '+=200%' })
            : scrub(after, '#transcript-chat', { pin: false, start: 'top 70%', end: 'bottom 30%' });
      }

      return () => {
        recordST = null;
        afterST = null;
      };
    },
  );

  const cue = (sel: string) => ScrollTrigger.create({ trigger: sel, start: 'top 50%' });
  const cues = {
    captions: cue('#captions .cue'),
    live: cue('#live-captions .cue'),
    video: cue('#video-recording .cue'),
    after: cue('#after-the-call .cue'),
  };

  wireCallClock(() => {
    const at = (st: ScrollTrigger | null, k: number, fallback: number) =>
      st ? st.start + (st.end - st.start) * k : fallback;
    const show = at(recordST, FLY.end, cues.captions.start);
    const finish = at(afterST, FINISH_AT, cues.after.start);
    return {
      show,
      finish,
      stops: [
        { at: show, seconds: 0 },
        { at: cues.captions.start, seconds: 42 },
        { at: cues.live.start, seconds: 65 },
        { at: cues.video.start, seconds: 750 },
        { at: finish, seconds: 2830 },
      ],
    };
  });

  const measureAll = () => {
    record?.measure?.();
    inputs?.measure?.();
  };
  ScrollTrigger.addEventListener('refresh', measureAll);
  ScrollTrigger.refresh();
}
