// Light and dark look for the menus (home, tournament, sheets). The match screens
// (intro, play, results) stay dark in both: they are the "arena", drawn for a dark table.
import type { ThemePref } from './store';

export type Theme = 'light' | 'dark';

/** Browser status-bar colour per theme (matches --bg in style.css). */
export const THEME_COLOR: Record<Theme, string> = { dark: '#110e26', light: '#f5f2ff' };

/** The theme a preference shows, given whether the phone is in dark mode. */
export function resolveTheme(pref: ThemePref | undefined, systemDark: boolean): Theme {
  if (pref === 'light' || pref === 'dark') return pref;
  return systemDark ? 'dark' : 'light';
}

const media = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null);

/** Put the theme on <html data-theme> and the status bar; returns what it applied. */
export function applyTheme(pref: ThemePref | undefined): Theme {
  const t = resolveTheme(pref, media()?.matches ?? true);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[t]);
  return t;
}

/** Re-apply when the phone switches light/dark (only matters for 'auto'). */
export function watchSystemTheme(pref: () => ThemePref | undefined): void {
  media()?.addEventListener?.('change', () => applyTheme(pref()));
}
