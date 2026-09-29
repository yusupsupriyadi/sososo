// Scroll choreography. Every scrubbed piece is a pure function of scroll
// progress, so scrolling back up plays it backwards exactly.
//
// Motion purposes, one line each:
// - caption settle (headings): the product's own interim → final behavior is the page's voice
// - hero rings: the logo's O "hears" each finished caption line
// - two-input timeline (pinned): shows the core idea, two inputs merging into one transcript
// - live sentence (pinned): shows an interim word being corrected before the line settles
// - keycaps: the shortcut is pressed, then recording starts
// - chat, picker, privacy lines: play the real app flow once, in order, as it comes into view

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

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
    {
      opacity: 0.5,
      y: 0,
      filter: 'blur(0px)',
      duration: 0.34,
      ease: 'power3.out',
      stagger: 0.075,
    },
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

export function ringPulse(): void {
  const pulse = $<SVGCircleElement>('.js-ring-pulse');
  if (!pulse) return;
  gsap.fromTo(
    pulse,
    { attr: { r: 70 }, opacity: 1 },
    { attr: { r: 330 }, opacity: 0, duration: 1.8, ease: 'power2.out', overwrite: true },
  );
}

function wireHeroRings(): void {
  const rings = $('.js-rings');
  if (!rings) return;
  gsap.to(rings, {
    scale: 1.18,
    transformOrigin: '50% 50%',
    ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true },
  });
}

function wireShortcut(): void {
  const keys = $$('.js-key');
  const statusEl = $('.js-key-status');
  if (!keys.length || !statusEl) return;
  const tl = gsap.timeline({
    scrollTrigger: { trigger: '#shortcut-keys', start: 'top 82%', end: 'top 38%', scrub: 0.6 },
  });
  const depth = parseFloat(getComputedStyle(keys[0]).getPropertyValue('--depth')) || 8;
  tl.set(statusEl, { opacity: 0, x: -12 });
  keys.forEach((key, i) => {
    tl.to(key, { y: depth - 2, '--depth': '2px', duration: 0.2, ease: 'power2.in' }, i * 0.18);
  });
  tl.to(keys, { y: 0, '--depth': `${depth}px`, duration: 0.2, ease: 'power2.out' }, 0.72);
  tl.to(statusEl, { opacity: 1, x: 0, duration: 0.25, ease: 'power3.out' }, 0.78);
}

/** Two inputs → one transcript. Returns the progress renderer so the mobile
 *  (unpinned) and desktop (pinned) triggers share it. */
function twoInputsRenderer(): ((p: number) => void) | null {
  const figure = $('#two-inputs');
  const playhead = $('.js-playhead', figure ?? document);
  if (!figure || !playhead) return null;

  const bars = $$<HTMLElement>('.track-bar', figure).map((bar) => ({
    fill: $('i', bar)!,
    from: parseFloat(bar.style.left) / 100,
    width: parseFloat(bar.style.width) / 100,
  }));

  const lines = $$<HTMLElement>('.js-line', figure).map((li) => {
    const text = $('.caption-text', li)!;
    const words = text.textContent!.trim().split(/\s+/);
    text.replaceChildren(
      ...words.flatMap((w, i) => {
        const span = document.createElement('span');
        span.textContent = w;
        return i === words.length - 1 ? [span] : [span, document.createTextNode(' ')];
      }),
    );
    return {
      li,
      text,
      words: $$('span', text),
      from: Number(li.dataset.from),
      to: Number(li.dataset.to),
    };
  });

  return (p: number) => {
    gsap.set(playhead, { xPercent: p * 100 });
    for (const bar of bars) {
      gsap.set(bar.fill, { scaleX: clamp01((p - bar.from) / bar.width) });
    }
    for (const line of lines) {
      const started = p >= line.from;
      const final = p >= line.to;
      const shown = final
        ? line.words.length
        : Math.ceil(clamp01((p - line.from) / (line.to - line.from)) * line.words.length);
      line.li.style.opacity = started ? '1' : '0';
      line.text.classList.toggle('is-interim', started && !final);
      line.words.forEach((w, i) => (w.style.opacity = i < shown ? '1' : '0'));
    }
  };
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

function wireChat(): void {
  const chat = $('#transcript-chat');
  if (!chat) return;
  const bubbles = $$('.js-chat', chat);
  const thinking = $('.js-chat-thinking', chat);
  const last = $('.js-chat-last', chat);
  if (!thinking || !last) return;

  const firstThree = bubbles.filter((b) => b !== thinking && b !== last);
  gsap.set([...firstThree, last], { opacity: 0, y: 8 });
  const tl = gsap.timeline({ paused: true });
  firstThree.forEach((b, i) => {
    tl.to(b, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' }, 0.3 + i * 0.8);
  });
  tl.call(() => thinking.classList.remove('hidden'), [], 2.3)
    .fromTo(thinking, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 2.3)
    .call(() => thinking.classList.add('hidden'), [], 3.6)
    .to(last, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }, 3.6);
  ScrollTrigger.create({ trigger: chat, start: 'top 70%', once: true, onEnter: () => tl.play() });
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
        scrollTrigger: { trigger: line, start: 'top 85%', end: 'top 55%', scrub: 0.5 },
      },
    );
  }
}

function wireFooter(): void {
  const rings = $('.js-footer-rings');
  const mark = $('.js-big-wordmark');
  if (!rings || !mark) return;
  const st = { trigger: '#open-source', start: 'top bottom', end: 'bottom bottom', scrub: true };
  gsap.fromTo(rings, { scale: 0.8 }, { scale: 1.1, ease: 'none', scrollTrigger: st });
  gsap.fromTo(mark, { yPercent: 18 }, { yPercent: 0, ease: 'none', scrollTrigger: st });
}

export function initMotion(onHeroSettled: () => void): void {
  // `?debug` exposes the engine so a review can scrub time frame by frame
  // (background tabs throttle requestAnimationFrame to ~1 fps).
  if (/[?&]debug\b/.test(window.location.search)) {
    Object.assign(window, { gsap, ScrollTrigger });
  }

  wireHeadings(onHeroSettled);
  wireReveals();
  wireHeroRings();
  wireShortcut();
  wirePicker();
  wireChat();
  wireTranslations();
  wirePrivacyFlow();
  wireFooter();

  const renderInputs = twoInputsRenderer();
  const mm = gsap.matchMedia();

  mm.add('(min-width: 1024px)', () => {
    // pinned: the section holds still while the call plays out under the scroll
    if (renderInputs) {
      const state = { p: 0 };
      gsap.to(state, {
        p: 1,
        ease: 'none',
        onUpdate: () => renderInputs(state.p),
        scrollTrigger: {
          trigger: '.js-captions-pin',
          start: 'top top',
          end: '+=150%',
          pin: true,
          scrub: 0.5,
        },
      });
      renderInputs(0);
    }
    const live = liveSentenceTimeline();
    if (live) {
      ScrollTrigger.create({
        animation: live,
        trigger: '.js-live-pin',
        start: 'top top',
        end: '+=130%',
        pin: true,
        scrub: 0.5,
      });
    }
  });

  mm.add('(max-width: 1023.98px)', () => {
    if (renderInputs) {
      const state = { p: 0 };
      gsap.to(state, {
        p: 1,
        ease: 'none',
        onUpdate: () => renderInputs(state.p),
        scrollTrigger: { trigger: '#two-inputs', start: 'top 75%', end: 'bottom 45%', scrub: 0.5 },
      });
      renderInputs(0);
    }
    const live = liveSentenceTimeline();
    if (live) {
      ScrollTrigger.create({
        animation: live,
        trigger: '.live-sentence',
        start: 'top 80%',
        end: 'bottom 35%',
        scrub: 0.5,
      });
    }
  });
}
