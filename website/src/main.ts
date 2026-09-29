import './styles.css';

import { mountHeroDemo } from './hero-demo';
import {
  LATEST_RELEASE_API,
  REPO_API,
  detectOS,
  formatVersion,
  primaryDownload,
} from './lib/release';
import { THEME_STORAGE_KEY, nextTheme, resolveTheme, type Theme } from './lib/theme';
import { mountFinaleField, mountHeroField } from './scene';
import { buildWaves } from './tracks';

// The inline head script decides this before first paint (reduced motion,
// `?motion` override); everything below follows its call.
const motionOn = document.documentElement.classList.contains('motion');

function wireTheme(): void {
  const btn = document.getElementById('btn-theme');
  if (!btn) return;
  const root = document.documentElement;

  const apply = (theme: Theme) => {
    root.setAttribute('data-theme', theme);
    btn.setAttribute(
      'aria-label',
      theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
    );
  };

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    /* storage blocked: the OS preference still applies */
  }
  apply(resolveTheme(stored, window.matchMedia('(prefers-color-scheme: dark)').matches));

  btn.addEventListener('click', () => {
    const theme = nextTheme(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    apply(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* the choice just won't survive a reload */
    }
  });
}

// Nav: hairline once the page scrolls, plus the mobile menu.
function wireNav(): void {
  const header = document.getElementById('site-nav');
  const btn = document.getElementById('btn-menu');
  const menu = document.getElementById('mobile-menu');
  if (!header || !btn || !menu) return;

  const onScroll = () => {
    const scrolled = window.scrollY > 8;
    header.classList.toggle('border-line', scrolled);
    header.classList.toggle('border-transparent', !scrolled);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // smooth scroll takes over anchor jumps, so move keyboard focus by hand
  document.querySelector('.skip-link')?.addEventListener('click', () => {
    document.getElementById('main')?.focus({ preventScroll: true });
  });

  const setOpen = (open: boolean) => {
    menu.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => setOpen(menu.classList.contains('hidden')));
  menu.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.classList.contains('hidden')) {
      setOpen(false);
      btn.focus();
    }
  });
}

// Point the hero button at the visitor's OS and mark that row in the download list.
function wireDownloadCta(): void {
  const os = detectOS(navigator.platform ?? '', navigator.userAgent);
  const cta = document.querySelector<HTMLAnchorElement>('#cta-primary');
  const label = document.querySelector<HTMLSpanElement>('#cta-label');
  if (!cta || !label) return;

  const dl = primaryDownload(os);
  if (dl) {
    cta.href = dl.url;
    label.textContent = `Download for ${dl.shortName}`;
  } else {
    // Mobile/unknown: send visitors to the download list instead of a binary.
    cta.href = '#download';
    label.textContent = 'See downloads';
  }

  if (os !== 'unknown') {
    document.querySelector(`[data-os="${os}"] .js-detected`)?.classList.remove('hidden');
  }
}

// Best-effort: on a rate limit or offline, the neutral defaults stay in place.
async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

function formatStars(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(count);
}

async function wireGitHubData(): Promise<void> {
  try {
    const release = await fetchJson(LATEST_RELEASE_API);
    const version = formatVersion(typeof release.tag_name === 'string' ? release.tag_name : null);
    if (version) {
      document.querySelectorAll('.js-version').forEach((el) => (el.textContent = version));
    }
  } catch {
    /* keep "latest release" */
  }

  try {
    const repo = await fetchJson(REPO_API);
    if (typeof repo.stargazers_count === 'number') {
      const stars = `★ ${formatStars(repo.stargazers_count)}`;
      document.querySelectorAll('.js-star-count').forEach((el) => (el.textContent = stars));
    }
  } catch {
    /* no count shown */
  }
}

// Lite YouTube embed: no request goes to YouTube until the visitor presses play.
function wireVideo(): void {
  const shell = document.getElementById('video-shell');
  const play = document.getElementById('btn-play-demo');
  if (!shell || !play) return;
  play.addEventListener(
    'click',
    () => {
      const iframe = document.createElement('iframe');
      iframe.className = 'absolute inset-0 h-full w-full';
      iframe.src = 'https://www.youtube-nocookie.com/embed/al1_YU_ILXs?autoplay=1';
      iframe.title = 'sososo demo video';
      iframe.allow =
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      shell.replaceChildren(iframe);
      iframe.focus();
    },
    { once: true },
  );
}

wireTheme();
wireNav();
wireDownloadCta();
void wireGitHubData();
wireVideo();

const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

const inputs = document.getElementById('two-inputs');
if (inputs) buildWaves(inputs);

const heroScene = mountHeroField(!motionOn);
mountFinaleField(!motionOn);
const onLineFinal = heroScene?.pulse;

if (motionOn) {
  // Split headings only once the webfonts are in, or word boxes measure wrong.
  void document.fonts.ready.then(async () => {
    try {
      const { initMotion } = await import('./motion');
      initMotion(() => mountHeroDemo({ still: false, onLineFinal }));
    } catch (err) {
      // never leave content hidden because an animation failed
      document.documentElement.classList.remove('motion');
      mountHeroDemo({ still: false, onLineFinal });
      console.error(err);
    }
  });
} else {
  mountHeroDemo({ still: true });
}
