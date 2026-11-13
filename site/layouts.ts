/**
 * Page layouts. A layout is a CSS file (site/layouts/<name>.css, scoped to
 * <html data-layout="<name>">) plus the player settings it needs.
 *
 * The site uses `layout` from portfolio.json. While you are choosing, a small
 * switcher tries them all: it shows in `npm run dev`, or on any build with
 * `?layouts` in the URL. `?layout=<name>` opens one layout directly.
 *
 * To add your own layout, see docs/custom-layouts.md.
 */
import type { PlayerChrome, WidgetControls } from '../player';

export interface LayoutDef {
  label: string;
  /** Player toolbar: every action, or text commands with a More menu and a status line. */
  chrome: PlayerChrome;
  /** Knobs, sliders and meters as graphics or as character cells. */
  controls: WidgetControls;
  /** Board position this layout is designed for (otherwise portfolio.json decides). */
  board?: 'right' | 'bottom';
  /** Heading of the instrument list in timeline view (default "Timeline"). */
  timelineTitle?: string;
  /** One line for the switcher's tooltip. */
  note: string;
}

export const LAYOUTS = {
  panel: { label: 'panel', chrome: 'minimal', controls: 'graphic', note: '1970s lab front panel: warm grey, small caps, one orange accent, LCD readout.' },
  manpage: {
    label: 'man page',
    chrome: 'minimal',
    controls: 'text',
    board: 'bottom',
    timelineTitle: 'History',
    note: 'A Unix manual page: one column, AUTHOR / INSTRUMENTS, text controls.',
  },
} as const satisfies Record<string, LayoutDef>;

export type LayoutName = keyof typeof LAYOUTS;
export const LAYOUT_NAMES = Object.keys(LAYOUTS) as LayoutName[];
export const DEFAULT_LAYOUT: LayoutName = 'panel';
const STORAGE_KEY = 'cp:layout';

export function isLayout(name: unknown): name is LayoutName {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(LAYOUTS, name);
}

/** Whether the layout switcher is offered (dev server, or ?layouts / ?layout= in the URL). */
export function switcherEnabled(search: string, dev: boolean): boolean {
  const params = new URLSearchParams(search);
  return dev || params.has('layouts') || params.has('layout');
}

function readStored(key = STORAGE_KEY): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered */
  }
}

/**
 * Which layout to show: ?layout= first, then (only while the switcher is on) the
 * last one tried, then portfolio.json, then the default.
 */
export function resolveLayout(options: { search: string; configured?: unknown; switcher: boolean; stored?: string | null }): LayoutName {
  const fromUrl = new URLSearchParams(options.search).get('layout');
  if (isLayout(fromUrl)) return fromUrl;
  if (options.switcher && isLayout(options.stored)) return options.stored;
  if (isLayout(options.configured)) return options.configured;
  return DEFAULT_LAYOUT;
}

export interface LayoutTarget {
  root: HTMLElement;
  player: HTMLElement;
  /** Board position from portfolio.json, used by layouts that don't set their own. */
  board?: string;
}

/** The settings of the layout the page currently shows (the default layout's before applyLayout). */
export function activeLayout(root: HTMLElement = document.documentElement): LayoutDef {
  const name = root.dataset.layout;
  return isLayout(name) ? LAYOUTS[name] : LAYOUTS[DEFAULT_LAYOUT];
}

/** Apply a layout to the page and the player. */
export function applyLayout(name: LayoutName, target: LayoutTarget): void {
  const def: LayoutDef = LAYOUTS[name];
  target.root.dataset.layout = name;
  target.player.setAttribute('chrome', def.chrome);
  target.player.setAttribute('controls', def.controls);
  const board = def.board ?? target.board;
  if (board) target.player.setAttribute('board', board);
  else target.player.removeAttribute('board');
  target.root.dispatchEvent(new CustomEvent('cp-layout', { detail: { layout: name }, bubbles: true }));
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest?.('input, textarea, select, [contenteditable], .cm-editor'));
}

/** The floating "layout: panel · man page" bar used while choosing. */
export function mountSwitcher(current: LayoutName, onChange: (name: LayoutName) => void): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'layout-switcher';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Layout preview');

  const setParam = (key: string, value: string) => {
    const url = new URL(location.href);
    url.searchParams.set(key, value);
    history.replaceState(history.state, '', url);
  };

  function group<T extends string>(title: string, names: readonly T[], active: T, label: (n: T) => string, pick: (n: T) => void, tip?: (n: T, i: number) => string) {
    const caption = document.createElement('span');
    caption.className = `layout-switcher__title layout-switcher--${title}`;
    caption.textContent = title;
    bar.append(caption);
    const buttons = new Map<T, HTMLButtonElement>();
    const select = (name: T) => {
      for (const [n, b] of buttons) b.setAttribute('aria-pressed', String(n === name));
      pick(name);
    };
    names.forEach((name, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `layout-switcher__button layout-switcher--${title}`;
      b.textContent = label(name);
      if (tip) b.title = tip(name, i);
      b.setAttribute('aria-pressed', String(name === active));
      b.addEventListener('click', () => select(name));
      buttons.set(name, b);
      bar.append(b);
    });
    return select;
  }

  const selectLayout = group(
    'layout',
    LAYOUT_NAMES,
    current,
    (n) => LAYOUTS[n].label,
    (name) => {
      writeStored(STORAGE_KEY, name);
      setParam('layout', name);
      onChange(name);
    },
    (n, i) => `${LAYOUTS[n].note} (Alt+${i + 1})`,
  );

  const hide = document.createElement('button');
  hide.type = 'button';
  hide.className = 'layout-switcher__hide';
  hide.textContent = '×';
  hide.title = 'Hide (Alt+0 shows it again)';
  hide.setAttribute('aria-label', 'Hide the layout switcher');
  hide.addEventListener('click', () => (bar.hidden = true));
  bar.append(hide);

  // Alt+1…n switch layouts, Alt+0 toggles the bar (event.code, so it works on every keyboard layout).
  window.addEventListener('keydown', (event) => {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    // Never while typing: Alt+digit types characters on many keyboards (e.g. # on a Mac).
    if (isTyping(event.target)) return;
    const m = event.code.match(/^Digit(\d)$/);
    if (!m) return;
    const n = Number(m[1]);
    if (n === 0) bar.hidden = !bar.hidden;
    else if (LAYOUT_NAMES[n - 1]) selectLayout(LAYOUT_NAMES[n - 1]);
    else return;
    event.preventDefault();
  });
  document.body.append(bar);
  return bar;
}

export function storedLayout(): string | null {
  return readStored(STORAGE_KEY);
}
