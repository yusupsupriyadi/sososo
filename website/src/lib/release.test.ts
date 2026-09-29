import { describe, expect, test } from 'bun:test';

import {
  DOWNLOADS,
  LATEST_RELEASE_API,
  RELEASE_BASE,
  REPO_API,
  detectOS,
  formatVersion,
  primaryDownload,
} from './release';

const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

describe('detectOS', () => {
  test('detects Windows from platform and UA', () => {
    expect(detectOS('Win32', WIN_UA)).toBe('windows');
    expect(detectOS('', WIN_UA)).toBe('windows');
  });

  test('detects macOS', () => {
    expect(detectOS('MacIntel', MAC_UA)).toBe('macos');
    expect(detectOS('', MAC_UA)).toBe('macos');
  });

  test('detects Linux', () => {
    expect(detectOS('Linux x86_64', LINUX_UA)).toBe('linux');
    expect(detectOS('', LINUX_UA)).toBe('linux');
  });

  test('mobile devices are unknown (no desktop build)', () => {
    expect(detectOS('Linux armv8l', ANDROID_UA)).toBe('unknown');
    expect(detectOS('iPhone', IPHONE_UA)).toBe('unknown');
  });

  test('empty inputs are unknown', () => {
    expect(detectOS('', '')).toBe('unknown');
  });
});

describe('DOWNLOADS', () => {
  test('every asset URL is a stable releases/latest/download link', () => {
    const assets = Object.values(DOWNLOADS).flatMap((d) => [d.primary, ...d.alternatives]);
    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets) {
      expect(asset.url.startsWith(`${RELEASE_BASE}/`)).toBe(true);
    }
  });

  test('asset filenames match the published release artifacts', () => {
    expect(DOWNLOADS.windows.primary.url.endsWith('/sososo_windows_x64-setup.exe')).toBe(true);
    expect(DOWNLOADS.windows.alternatives.map((a) => a.url.split('/').pop())).toEqual([
      'sososo_windows_x64.msi',
    ]);
    expect(DOWNLOADS.macos.primary.url.endsWith('/sososo_macos_universal.dmg')).toBe(true);
    expect(DOWNLOADS.linux.primary.url.endsWith('/sososo_amd64.deb')).toBe(true);
    expect(DOWNLOADS.linux.alternatives.map((a) => a.url.split('/').pop())).toEqual([
      'sososo_amd64.AppImage',
      'sososo_x86_64.rpm',
    ]);
  });

  test('carries human OS names and short CTA names', () => {
    expect(DOWNLOADS.windows.name).toBe('Windows 10/11');
    expect(DOWNLOADS.windows.shortName).toBe('Windows');
    expect(DOWNLOADS.macos.name).toBe('macOS 11+');
    expect(DOWNLOADS.macos.shortName).toBe('macOS');
    expect(DOWNLOADS.linux.shortName).toBe('Linux');
  });
});

describe('primaryDownload', () => {
  test('returns the primary asset plus CTA name per OS', () => {
    expect(primaryDownload('windows')).toEqual({
      label: 'Installer (.exe)',
      url: `${RELEASE_BASE}/sososo_windows_x64-setup.exe`,
      shortName: 'Windows',
    });
    expect(primaryDownload('macos')?.url).toBe(`${RELEASE_BASE}/sososo_macos_universal.dmg`);
    expect(primaryDownload('linux')?.shortName).toBe('Linux');
  });

  test('returns null for unknown OS so the UI can fall back to #download', () => {
    expect(primaryDownload('unknown')).toBeNull();
  });
});

describe('formatVersion', () => {
  test('keeps a v-prefixed tag as-is', () => {
    expect(formatVersion('v0.8.0')).toBe('v0.8.0');
    expect(formatVersion('v1.0.0-beta.1')).toBe('v1.0.0-beta.1');
  });

  test('adds the v prefix to bare semver tags', () => {
    expect(formatVersion('0.8.0')).toBe('v0.8.0');
  });

  test('rejects empty or non-version tags', () => {
    expect(formatVersion('')).toBeNull();
    expect(formatVersion(null)).toBeNull();
    expect(formatVersion(undefined)).toBeNull();
    expect(formatVersion('latest')).toBeNull();
  });
});

describe('API endpoints', () => {
  test('point at the sososo repo', () => {
    expect(LATEST_RELEASE_API).toBe(
      'https://api.github.com/repos/yusupsupriyadi/sososo/releases/latest',
    );
    expect(REPO_API).toBe('https://api.github.com/repos/yusupsupriyadi/sososo');
  });
});
