// The same rule runs inline in index.html before first paint (no light flash);
// keep the two in sync.

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'sososo-theme';

export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersDark ? 'dark' : 'light';
}

export function nextTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}
