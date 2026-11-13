// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeLayout,
  DEFAULT_LAYOUT,
  LAYOUTS,
  LAYOUT_NAMES,
  applyLayout,
  isLayout,
  mountSwitcher,
  resolveLayout,
  storedLayout,
  switcherEnabled,
  type LayoutName,
} from '../../site/layouts';

/**
 * Node 22+ installs an experimental `localStorage` global that is undefined
 * without --localstorage-file and shadows jsdom's implementation. Give the
 * tests (and the code under test) a working in-memory Storage.
 */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(String(key), String(value));
    },
  };
}

const storage = memoryStorage();

beforeEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: storage });
  localStorage.clear();
  history.replaceState(null, '', '/');
});

describe('layout table', () => {
  it('lists the two layouts in order with their player settings', () => {
    // The two built-in layouts come first; your own layouts may follow (docs/custom-layouts.md).
    expect(LAYOUT_NAMES.slice(0, 2)).toEqual(['panel', 'manpage']);
    expect(DEFAULT_LAYOUT).toBe('panel');

    expect(LAYOUTS.panel).toMatchObject({ label: 'panel', chrome: 'minimal', controls: 'graphic' });
    expect('board' in LAYOUTS.panel).toBe(false);
    expect(LAYOUTS.manpage).toMatchObject({
      label: 'man page',
      chrome: 'minimal',
      controls: 'text',
      board: 'bottom',
    });
  });

  it('names the timeline per layout and reads the active layout from the page', () => {
    expect(LAYOUTS.manpage.timelineTitle).toBe('History');
    expect('timelineTitle' in LAYOUTS.panel).toBe(false);
    const root = document.createElement('html');
    expect(activeLayout(root)).toBe(LAYOUTS[DEFAULT_LAYOUT]);
    root.dataset.layout = 'manpage';
    expect(activeLayout(root)).toBe(LAYOUTS.manpage);
    root.dataset.layout = 'nope';
    expect(activeLayout(root)).toBe(LAYOUTS[DEFAULT_LAYOUT]);
  });

  it('gives every layout a note for the switcher tooltip', () => {
    for (const name of LAYOUT_NAMES) expect(LAYOUTS[name].note.length).toBeGreaterThan(0);
  });

  it('recognises only its own keys', () => {
    for (const name of LAYOUT_NAMES) expect(isLayout(name)).toBe(true);
    for (const value of ['', 'nope', 'Panel', 'studio', 'toString', '__proto__', 'hasOwnProperty', null, undefined, 3, {}]) {
      expect(isLayout(value)).toBe(false);
    }
  });

  it('offers the switcher in dev or when the URL asks for it', () => {
    expect(switcherEnabled('', true)).toBe(true);
    expect(switcherEnabled('', false)).toBe(false);
    expect(switcherEnabled('?layouts', false)).toBe(true);
    expect(switcherEnabled('?layouts=0', false)).toBe(true);
    expect(switcherEnabled('?layout=manpage', false)).toBe(true);
    expect(switcherEnabled('?foo=bar', false)).toBe(false);
  });
});

describe('resolveLayout', () => {
  it('prefers ?layout= over stored and configured values', () => {
    expect(resolveLayout({ search: '?layout=manpage', configured: 'panel', switcher: true, stored: 'panel' })).toBe(
      'manpage',
    );
    expect(resolveLayout({ search: '?layout=panel', configured: 'manpage', switcher: true, stored: 'manpage' })).toBe(
      'panel',
    );
  });

  it('ignores an invalid ?layout= value', () => {
    // With the switcher on, an unknown URL value falls through to the stored layout…
    expect(resolveLayout({ search: '?layout=nope', configured: 'manpage', switcher: true, stored: 'panel' })).toBe(
      'panel',
    );
    // …and with it off, to the configured layout.
    expect(resolveLayout({ search: '?layout=nope', configured: 'manpage', switcher: false, stored: 'panel' })).toBe(
      'manpage',
    );
  });

  it('uses the stored layout only while the switcher is on', () => {
    expect(resolveLayout({ search: '', configured: 'manpage', switcher: true, stored: 'panel' })).toBe('panel');
    expect(resolveLayout({ search: '', configured: 'manpage', switcher: false, stored: 'panel' })).toBe('manpage');
  });

  it('falls back to the configured layout and then to panel', () => {
    expect(resolveLayout({ search: '', configured: 'manpage', switcher: false })).toBe('manpage');
    expect(resolveLayout({ search: '', configured: 'nope', switcher: false })).toBe('panel');
    expect(resolveLayout({ search: '', configured: undefined, switcher: false })).toBe('panel');
    expect(resolveLayout({ search: '', configured: 42, switcher: false, stored: 'bogus' })).toBe('panel');
  });

  it('ignores a stored layout when the switcher is off', () => {
    expect(resolveLayout({ search: '', configured: undefined, switcher: false, stored: 'manpage' })).toBe('panel');
  });
});

describe('applyLayout', () => {
  function target(board?: string) {
    const root = document.createElement('div');
    const player = document.createElement('div');
    root.append(player);
    document.body.append(root);
    return { root, player, board };
  }

  it('sets the root layout and the player chrome/controls', () => {
    const { root, player } = target();
    applyLayout('manpage', { root, player });

    expect(root.dataset.layout).toBe('manpage');
    expect(player.getAttribute('chrome')).toBe('minimal');
    expect(player.getAttribute('controls')).toBe('text');
  });

  it('keeps the configured board position for panel', () => {
    const { root, player } = target('right');
    applyLayout('panel', { root, player, board: 'right' });
    expect(player.getAttribute('board')).toBe('right');
  });

  it('takes the board position from the layout when it defines one', () => {
    const { root, player } = target('right');
    applyLayout('manpage', { root, player, board: 'right' });
    expect(player.getAttribute('board')).toBe('bottom');
  });

  it('removes the board attribute when neither the layout nor the page defines one', () => {
    const { root, player } = target();
    player.setAttribute('board', 'bottom');
    applyLayout('panel', { root, player });
    expect(player.hasAttribute('board')).toBe(false);
  });

  it('dispatches a bubbling cp-layout event with the layout name', () => {
    const { root, player } = target();
    const parent = document.createElement('div');
    parent.append(root);
    document.body.append(parent);
    const events: CustomEvent<{ layout: LayoutName }>[] = [];
    parent.addEventListener('cp-layout', (event) => events.push(event as CustomEvent<{ layout: LayoutName }>));

    applyLayout('panel', { root, player });

    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({ layout: 'panel' });
    expect(events[0].target).toBe(root);
  });
});

describe('mountSwitcher', () => {
  function layoutButtons(bar: HTMLElement): HTMLButtonElement[] {
    return Array.from(bar.querySelectorAll<HTMLButtonElement>('.layout-switcher__button'));
  }

  function buttonNamed(bar: HTMLElement, text: string): HTMLButtonElement {
    return layoutButtons(bar).find((button) => button.textContent === text)!;
  }

  it('appends a group with one button per layout and marks the current one', () => {
    const onChange = vi.fn();
    const bar = mountSwitcher('manpage', onChange);

    expect(document.body.contains(bar)).toBe(true);
    expect(bar.className).toBe('layout-switcher');
    expect(bar.getAttribute('role')).toBe('group');
    expect(bar.getAttribute('aria-label')).toBe('Layout preview');
    expect(bar.hidden).toBe(false);

    const buttons = layoutButtons(bar);
    expect(buttons).toHaveLength(LAYOUT_NAMES.length);
    expect(buttons.map((b) => b.textContent)).toEqual(LAYOUT_NAMES.map((name) => LAYOUTS[name].label));
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(
      LAYOUT_NAMES.map((name) => String(name === 'manpage')),
    );
    expect(bar.querySelector('.layout-switcher__hide')).toBeTruthy();
  });

  it('remembers a clicked layout, writes it to the URL and reports it', () => {
    const onChange = vi.fn();
    const bar = mountSwitcher('panel', onChange);

    fireEventClick(buttonNamed(bar, 'man page'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('manpage');
    expect(localStorage.getItem('cp:layout')).toBe('manpage');
    expect(new URLSearchParams(location.search).get('layout')).toBe('manpage');
    expect(layoutButtons(bar).map((b) => b.getAttribute('aria-pressed'))).toEqual(
      LAYOUT_NAMES.map((name) => String(name === 'manpage')),
    );
  });

  it('hides the bar with its hide button', () => {
    const bar = mountSwitcher('panel', vi.fn());
    const hide = bar.querySelector<HTMLButtonElement>('.layout-switcher__hide')!;
    expect(hide.getAttribute('aria-label')).toBe('Hide the layout switcher');

    fireEventClick(hide);
    expect(bar.hidden).toBe(true);
  });

  it('selects layouts with Alt+Digit1 / Alt+Digit2 using event.code', () => {
    const onChange = vi.fn();
    const bar = mountSwitcher('panel', onChange);

    const second = new KeyboardEvent('keydown', { key: '2', code: 'Digit2', altKey: true, cancelable: true });
    window.dispatchEvent(second);

    expect(onChange).toHaveBeenCalledWith('manpage');
    expect(localStorage.getItem('cp:layout')).toBe('manpage');
    expect(new URLSearchParams(location.search).get('layout')).toBe('manpage');
    expect(second.defaultPrevented).toBe(true);
    expect(layoutButtons(bar)[1].getAttribute('aria-pressed')).toBe('true');

    const first = new KeyboardEvent('keydown', { key: '1', code: 'Digit1', altKey: true, cancelable: true });
    window.dispatchEvent(first);

    expect(onChange).toHaveBeenLastCalledWith('panel');
    expect(new URLSearchParams(location.search).get('layout')).toBe('panel');
    expect(layoutButtons(bar)[0].getAttribute('aria-pressed')).toBe('true');
    expect(layoutButtons(bar)[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('toggles the bar with Alt+Digit0', () => {
    const bar = mountSwitcher('panel', vi.fn());
    expect(bar.hidden).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit0', altKey: true, cancelable: true }));
    expect(bar.hidden).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit0', altKey: true, cancelable: true }));
    expect(bar.hidden).toBe(false);
  });

  it('ignores Alt-less, modified, non-digit and unknown layout keys', () => {
    const onChange = vi.fn();
    mountSwitcher('panel', onChange);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', altKey: true, ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', altKey: true, metaKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', altKey: true }));
    // The first digit after the last layout (Alt+3 with the two built-in ones; more if you add layouts).
    const unknown = new KeyboardEvent('keydown', { code: `Digit${LAYOUT_NAMES.length + 1}`, altKey: true, cancelable: true });
    if (LAYOUT_NAMES.length < 9) window.dispatchEvent(unknown);

    expect(onChange).not.toHaveBeenCalled();
    expect(unknown.defaultPrevented).toBe(false);
  });
});

describe('storedLayout', () => {
  it('reads the remembered layout', () => {
    expect(storedLayout()).toBeNull();
    localStorage.setItem('cp:layout', 'manpage');
    expect(storedLayout()).toBe('manpage');
  });
});

/** Click without pulling in extra helpers; the switcher is plain DOM. */
function fireEventClick(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

describe('switcher shortcuts while typing', () => {
  it('ignores Alt+digit when the key comes from a text field', () => {
    document.body.innerHTML = '';
    const onChange = vi.fn();
    mountSwitcher('panel', onChange);

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    const typingTargets: HTMLElement[] = [
      document.createElement('input'),
      document.createElement('textarea'),
      document.createElement('select'),
      editable,
      editor,
    ];
    for (const target of typingTargets) {
      document.body.append(target);
      target.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', key: '™', altKey: true, bubbles: true }));
      expect(onChange).not.toHaveBeenCalled();
    }

    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', key: '™', altKey: true, bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('manpage');
  });

  it('also ignores a nested element inside an editing surface', () => {
    const onChange = vi.fn();
    mountSwitcher('panel', onChange);

    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    const inner = document.createElement('span');
    editor.append(inner);
    document.body.append(editor);

    inner.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '¡', altKey: true, bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
