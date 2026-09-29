// Pure release/download logic for the landing page — the single source of truth
// for every download link, kept testable away from the DOM (see release.test.ts).

export type DesktopOS = 'windows' | 'macos' | 'linux';
export type DetectedOS = DesktopOS | 'unknown';

export const REPO = 'yusupsupriyadi/sososo';
export const REPO_URL = `https://github.com/${REPO}`;
/** Stable "latest release" asset links — never go stale on a new release. */
export const RELEASE_BASE = `${REPO_URL}/releases/latest/download`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const REPO_API = `https://api.github.com/repos/${REPO}`;

export interface DownloadAsset {
  label: string;
  url: string;
}

export interface OsDownloads {
  /** Full marketing name, e.g. "Windows 10/11". */
  name: string;
  /** Short name for CTA labels, e.g. "Download for Windows". */
  shortName: string;
  primary: DownloadAsset;
  alternatives: DownloadAsset[];
}

export const DOWNLOADS: Record<DesktopOS, OsDownloads> = {
  windows: {
    name: 'Windows 10/11',
    shortName: 'Windows',
    primary: { label: 'Installer (.exe)', url: `${RELEASE_BASE}/sososo_windows_x64-setup.exe` },
    alternatives: [{ label: '.msi', url: `${RELEASE_BASE}/sososo_windows_x64.msi` }],
  },
  macos: {
    name: 'macOS 11+',
    shortName: 'macOS',
    primary: { label: 'Universal .dmg', url: `${RELEASE_BASE}/sososo_macos_universal.dmg` },
    alternatives: [],
  },
  linux: {
    name: 'Linux',
    shortName: 'Linux',
    primary: { label: '.deb', url: `${RELEASE_BASE}/sososo_amd64.deb` },
    alternatives: [
      { label: '.AppImage', url: `${RELEASE_BASE}/sososo_amd64.AppImage` },
      { label: '.rpm', url: `${RELEASE_BASE}/sososo_x86_64.rpm` },
    ],
  },
};

/**
 * Best-effort desktop OS detection from `navigator.platform` + user agent.
 * Mobile devices return 'unknown' — there is no mobile build to offer.
 */
export function detectOS(platform: string, userAgent: string): DetectedOS {
  const p = platform.toLowerCase();
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod|android/.test(ua) || /iphone|ipad|ipod|android/.test(p)) {
    return 'unknown';
  }
  if (p.includes('win') || ua.includes('windows')) return 'windows';
  if (p.includes('mac') || ua.includes('mac os')) return 'macos';
  if (p.includes('linux') || ua.includes('x11')) return 'linux';
  return 'unknown';
}

/** The one-click hero CTA target for a detected OS; null → fall back to #download. */
export function primaryDownload(os: DetectedOS): (DownloadAsset & { shortName: string }) | null {
  if (os === 'unknown') return null;
  const { primary, shortName } = DOWNLOADS[os];
  return { ...primary, shortName };
}

/** Normalizes a GitHub release tag to a display version ("0.8.0" → "v0.8.0"). */
export function formatVersion(tag: string | null | undefined): string | null {
  const trimmed = tag?.trim();
  if (!trimmed) return null;
  if (/^v\d/.test(trimmed)) return trimmed;
  if (/^\d/.test(trimmed)) return `v${trimmed}`;
  return null;
}
