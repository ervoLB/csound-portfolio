/** play.html: load any CSD by URL (?src=...). */
import { defineCsoundPlayer, warmUpEngine, type CsoundPlayerElement } from '../player';
import { fetchJson, type PortfolioConfig } from './config';
import { applyLayout, resolveLayout, storedLayout, switcherEnabled } from './layouts';
import { initThemeToggle } from './theme';
import './style.css';
import './layouts/index.css';

/** GitHub/GitLab page links → raw file links. Exported for tests. */
export function toRawUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.hostname === 'github.com') {
    const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
  }
  if (url.hostname === 'gitlab.com' && url.pathname.includes('/-/blob/')) {
    url.pathname = url.pathname.replace('/-/blob/', '/-/raw/');
    return url.href;
  }
  return url.href;
}

if (typeof document !== 'undefined' && document.getElementById('src-form')) {
  initThemeToggle(document.getElementById('theme-toggle')!);
  const config = await fetchJson<PortfolioConfig>('portfolio.json').catch(() => ({}) as PortfolioConfig);
  warmUpEngine();
  const player = document.getElementById('player') as CsoundPlayerElement;
  // Same design as the portfolio page (the switcher itself lives there).
  const switcher = switcherEnabled(location.search, import.meta.env.DEV);
  applyLayout(resolveLayout({ search: location.search, configured: config.layout, switcher, stored: storedLayout() }), {
    root: document.documentElement,
    player,
    board: config.player?.board,
  });
  defineCsoundPlayer();
  const form = document.getElementById('src-form') as HTMLFormElement;
  const input = document.getElementById('src-input') as HTMLInputElement;
  const error = document.getElementById('src-error')!;

  const load = async (value: string, play: boolean) => {
    error.hidden = true;
    let raw: string;
    try {
      raw = toRawUrl(value);
    } catch {
      error.textContent = 'That is not a valid link.';
      error.hidden = false;
      return;
    }
    const protocol = new URL(raw).protocol;
    if (protocol !== 'https:' && !(protocol === 'http:' && location.protocol === 'http:')) {
      error.textContent =
        protocol === 'http:' ? 'Use an https:// link: this page is served over HTTPS and browsers block plain http downloads here.' : 'Only http(s) links are supported.';
      error.hidden = false;
      return;
    }
    const params = new URLSearchParams(location.search);
    params.set('src', value.trim());
    history.replaceState(null, '', `?${params}`);
    const ok = await player.load(raw);
    if (!ok) {
      error.textContent = `Couldn't load ${raw}. Check the link, and that the server allows cross-site downloads (CORS).`;
      error.hidden = false;
      return;
    }
    if (play) await player.play();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void load(input.value, true);
  });

  const initial = new URLSearchParams(location.search).get('src');
  if (initial) {
    input.value = initial;
    void load(initial, false);
  }
}
