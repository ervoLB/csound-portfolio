/**
 * Portfolio page logic: header from portfolio.json, the instrument list from
 * instruments.json, tag filters, #/slug links and the shared <csound-player>.
 * This file is yours to change; it only talks to the player through its public API.
 */
import { defineCsoundPlayer, warmUpEngine, type CsoundPlayerElement } from '../player';
import { fetchJson, safeHref, type InstrumentEntry, type PortfolioConfig } from './config';
import { activeLayout, applyLayout, mountSwitcher, resolveLayout, storedLayout, switcherEnabled } from './layouts';
import { initials } from './profile';
import { initThemeToggle } from './theme';
import { hasDates, timelineGroups } from './timeline';
import './style.css';
import './layouts/index.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

type RackView = 'list' | 'timeline';

/** Per-visitor page preferences (never throws: private mode, blocked storage). */
function readPref(key: string): string | null {
  try {
    return localStorage.getItem(`cp:${key}`);
  } catch {
    return null;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(`cp:${key}`, value);
  } catch {
    /* not remembered */
  }
}

const state = {
  instruments: [] as InstrumentEntry[],
  activeTag: null as string | null,
  current: null as InstrumentEntry | null,
  view: (readPref('rack-view') === 'timeline' ? 'timeline' : 'list') as RackView,
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function slugFromHash(): string | null {
  const m = location.hash.match(/^#\/?(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

// ------------------------------------------------------------------ header

function renderHeader(config: PortfolioConfig) {
  const title = config.title?.trim() || 'Csound Instruments';
  $('site-title').textContent = title;
  document.title = title;
  const bio = $('site-bio');
  bio.textContent = config.bio ?? '';
  bio.hidden = !config.bio;

  // Profile: name and photo. Without a photo the name's initials stand in.
  const author = config.author?.trim() ?? '';
  const avatar = config.avatar ? safeHref(config.avatar) : null;
  const authorLine = $('site-author');
  authorLine.textContent = author;
  authorLine.hidden = !author;
  const profile = $('site-profile');
  const photo = $<HTMLImageElement>('site-avatar');
  const mark = $('site-initials');
  const showInitials = () => {
    photo.hidden = true;
    mark.textContent = initials(author);
    mark.hidden = !author;
    profile.hidden = !author;
  };
  if (avatar) {
    photo.src = avatar;
    photo.alt = author ? `Photo of ${author}` : 'Profile photo';
    photo.hidden = false;
    mark.hidden = true;
    profile.hidden = false;
    photo.addEventListener('error', showInitials, { once: true });
  } else {
    showInitials();
  }

  const nav = $('site-links');
  nav.replaceChildren();
  for (const link of config.links ?? []) {
    const href = safeHref(link.url);
    if (!href || !link.label) continue;
    const a = el('a', 'site-link', link.label);
    a.href = href;
    a.rel = 'noopener';
    nav.append(a);
  }
}

// ------------------------------------------------------------------ list

function tagCounts(list: InstrumentEntry[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const i of list) for (const t of i.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function renderFilters() {
  const box = $('tag-filter');
  box.replaceChildren();
  const tags = tagCounts(state.instruments);
  $('tag-details').hidden = tags.length < 2;
  // The closed filter box still says which tag is active.
  $('filter-active').textContent = state.activeTag ? `: ${state.activeTag}` : '';
  const chip = (label: string, tag: string | null) => {
    const b = el('button', 'chip', label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(state.activeTag === tag));
    b.addEventListener('click', () => {
      state.activeTag = state.activeTag === tag ? null : tag;
      renderFilters();
      renderList();
    });
    return b;
  };
  box.append(chip('All', null));
  for (const [tag] of tags) box.append(chip(tag, tag));
}

function rackTitle(): string {
  const timeline = hasDates(state.instruments) && state.view === 'timeline';
  if (!timeline) return 'Instruments';
  return activeLayout().timelineTitle ?? 'Timeline';
}

function renderList() {
  const list = $('instrument-list');
  list.removeAttribute('aria-busy');
  list.replaceChildren();
  const visible = state.instruments.filter((i) => !state.activeTag || i.tags.includes(state.activeTag));
  $('instrument-count').textContent = state.activeTag ? `${visible.length}/${state.instruments.length}` : String(state.instruments.length);
  // The timeline is offered once at least one instrument has a release date.
  const timelineAvailable = hasDates(state.instruments);
  const view: RackView = timelineAvailable ? state.view : 'list';
  const views = $('rack-view');
  views.hidden = !timelineAvailable;
  for (const b of views.querySelectorAll<HTMLButtonElement>('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === view));
  $('rack-title-text').textContent = rackTitle();
  $('rack').classList.toggle('rack--timeline', view === 'timeline');
  if (state.instruments.length === 0) {
    const li = el('li', 'rack__placeholder');
    li.innerHTML = 'No instruments yet. Add a folder with a <code>.csd</code> file to <code>instruments/</code> and rebuild.';
    list.append(li);
    return;
  }
  const groups = view === 'timeline' ? timelineGroups(visible) : [{ label: '', items: visible }];
  for (const group of groups) {
    if (!group.label) {
      for (const instrument of group.items) list.append(cardItem(instrument));
      continue;
    }
    // Timeline: one list item per year, holding a heading and that year's instruments.
    const year = el('li', 'rack__group');
    const heading = el('h3', 'rack__year', group.label);
    const items = el('ol', 'rack__sublist');
    items.setAttribute('aria-label', group.label);
    for (const instrument of group.items) items.append(cardItem(instrument));
    year.append(heading, items);
    list.append(year);
  }
  setReadout();
}

function cardItem(instrument: InstrumentEntry): HTMLLIElement {
  const li = el('li');
  const button = el('button', 'card');
  button.type = 'button';
  button.dataset.slug = instrument.slug;
  if (state.current?.slug === instrument.slug) button.setAttribute('aria-current', 'true');
  if (instrument.preview) {
    const img = el('img', 'card__preview');
    img.src = instrument.preview;
    img.alt = '';
    img.loading = 'lazy';
    button.append(img);
  }
  const body = el('span', 'card__body');
  body.append(el('span', 'card__title', instrument.title));
  // The file name is the man page's label for an entry (the title stays for assistive tech).
  const file = el('span', 'card__file', fileOf(instrument));
  file.setAttribute('aria-hidden', 'true');
  body.append(file);
  if (instrument.date) {
    const date = el('time', 'card__date', instrument.date);
    date.dateTime = instrument.date;
    body.append(date);
  }
  if (instrument.description) body.append(el('span', 'card__desc', instrument.description));
  if (instrument.tags.length) {
    // Assistive tech already gets the tags as filter buttons.
    const tags = el('span', 'card__tags', instrument.tags.map((t) => `#${t}`).join(' '));
    tags.setAttribute('aria-hidden', 'true');
    body.append(tags);
  }
  button.append(body);
  button.addEventListener('click', () => select(instrument, { play: true }));
  // Hover (mouse or pen) or keyboard focus shows the description in the readout.
  button.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'touch') setReadout({ hovered: instrument });
  });
  button.addEventListener('pointerleave', () => setReadout({ hovered: null }));
  button.addEventListener('focus', () => setReadout({ focused: instrument }));
  button.addEventListener('blur', () => setReadout({ focused: null }));
  // Start fetching Csound as soon as someone shows interest.
  button.addEventListener('pointerenter', () => engine.preload(), { once: true });
  li.append(button);
  return li;
}

/**
 * The readout under the list: the hovered instrument, else the focused one, else
 * the current one (so the box keeps its place and the list never jumps).
 */
const readout = { hovered: null as InstrumentEntry | null, focused: null as InstrumentEntry | null };
function setReadout(change: Partial<typeof readout> = {}) {
  Object.assign(readout, change);
  const shown = readout.hovered ?? readout.focused ?? state.current;
  $('rack-readout').textContent = shown?.description ?? '';
}

/** File name of an instrument's CSD ("algo_synth.csd"). */
function fileOf(i: InstrumentEntry): string {
  return i.csd.split('/').pop() || `${i.slug}.csd`;
}

// -------------------------------------------------- list: collapse and info

/** The fold is remembered per layout: the panel's side strip and the man page's section differ. */
function rackKey(name: string) {
  return `${name}:${document.documentElement.dataset.layout ?? ''}`;
}

function setRackCollapsed(collapsed: boolean) {
  const toggle = $('rack-toggle');
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.title = collapsed ? 'Show the instrument list' : 'Hide the instrument list';
  $('rack-body').hidden = collapsed;
  $('rack').classList.toggle('rack--collapsed', collapsed);
  $('site-main').classList.toggle('site-main--rack-collapsed', collapsed);
  writePref(rackKey('rack-collapsed'), collapsed ? '1' : '0');
}

function setRackInfo(on: boolean) {
  $<HTMLInputElement>('rack-info').checked = on;
  $('rack').classList.toggle('rack--info', on);
  writePref(rackKey('rack-info'), on ? '1' : '0');
}

// ------------------------------------------------------------------ stage

function renderInfo(i: InstrumentEntry) {
  const info = $('instrument-info');
  info.replaceChildren();
  const title = el('h2', 'stage__title', i.title);
  title.id = 'instrument-title';
  info.append(title);
  if (i.description) info.append(el('p', 'stage__desc', i.description));
  const meta = el('div', 'stage__meta');
  for (const tag of i.tags) meta.append(el('span', 'tag', tag));
  // Under the title: the tags and the release date, nothing else.
  if (i.date) meta.append(el('span', 'stage__facts', `released ${i.date}`));
  if (meta.childElementCount) info.append(meta);
}

const player = $<CsoundPlayerElement>('player');
let engine: ReturnType<typeof warmUpEngine>;

async function select(instrument: InstrumentEntry, { play }: { play: boolean }) {
  state.current = instrument;
  for (const card of document.querySelectorAll<HTMLButtonElement>('.card')) {
    if (card.dataset.slug === instrument.slug) card.setAttribute('aria-current', 'true');
    else card.removeAttribute('aria-current');
  }
  renderInfo(instrument);
  setReadout();
  const hash = `#/${encodeURIComponent(instrument.slug)}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  // load() primes audio synchronously, so a click can start sound right away.
  const loaded = await player.load(instrument.csd);
  if (loaded && play && state.current === instrument) {
    await player.play();
    // Focus the player so the computer keyboard plays MIDI instruments right away.
    if (state.current === instrument) player.focus({ preventScroll: true });
  }
}

// ------------------------------------------------------------------ boot

async function boot() {
  initThemeToggle($('theme-toggle'));
  let config: PortfolioConfig = {};
  try {
    config = await fetchJson<PortfolioConfig>('portfolio.json');
  } catch (error) {
    console.warn(error);
  }
  renderHeader(config);
  engine = warmUpEngine();
  if (config.player?.editor) player.setAttribute('editor', config.player.editor);
  const root = document.documentElement;
  const layoutTarget = { root, player, board: config.player?.board };
  const switcher = switcherEnabled(location.search, import.meta.env.DEV);
  const layout = resolveLayout({ search: location.search, configured: config.layout, switcher, stored: storedLayout() });
  applyLayout(layout, layoutTarget);
  const restoreRack = () => {
    setRackCollapsed(readPref(rackKey('rack-collapsed')) === '1');
    setRackInfo(readPref(rackKey('rack-info')) === '1');
  };
  if (switcher) {
    mountSwitcher(layout, (name) => {
      applyLayout(name, layoutTarget);
      restoreRack();
      // Only the heading's wording depends on the layout; keep the list (and focus) as is.
      if (state.instruments.length) $('rack-title-text').textContent = rackTitle();
    });
  }
  defineCsoundPlayer();

  restoreRack();
  $('rack-toggle').addEventListener('click', () => setRackCollapsed($('rack-toggle').getAttribute('aria-expanded') === 'true'));
  $<HTMLInputElement>('rack-info').addEventListener('change', (e) => setRackInfo((e.target as HTMLInputElement).checked));

  try {
    const manifest = await fetchJson<{ instruments: InstrumentEntry[] }>('instruments.json');
    state.instruments = manifest.instruments ?? [];
  } catch (error) {
    const list = $('instrument-list');
    list.removeAttribute('aria-busy');
    list.replaceChildren(el('li', 'rack__placeholder', error instanceof Error ? error.message : String(error)));
    return;
  }
  renderFilters();
  renderList();
  for (const b of document.querySelectorAll<HTMLButtonElement>('#rack-view [data-view]')) {
    b.addEventListener('click', () => {
      state.view = b.dataset.view === 'timeline' ? 'timeline' : 'list';
      writePref('rack-view', state.view);
      renderList();
    });
  }

  const fromHash = slugFromHash();
  const initial = state.instruments.find((i) => i.slug === fromHash) ?? state.instruments[0];
  if (initial) void select(initial, { play: false });

  window.addEventListener('hashchange', () => {
    const slug = slugFromHash();
    const next = state.instruments.find((i) => i.slug === slug);
    if (next && next !== state.current) void select(next, { play: false });
  });
}

void boot();
