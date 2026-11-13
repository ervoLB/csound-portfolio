// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentTheme, initThemeToggle } from '../../site/theme';

let systemDark = false;
const store = new Map<string, string>();

beforeEach(() => {
  systemDark = false;
  store.clear();
  delete document.documentElement.dataset.theme;
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('dark') ? systemDark : !systemDark,
    addEventListener: () => {},
  }));
});

function button() {
  const b = document.createElement('button');
  document.body.replaceChildren(b);
  return b;
}

describe('theme switch', () => {
  it('follows the system until clicked, and offers the other theme', () => {
    systemDark = true;
    const b = button();
    initThemeToggle(b);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(currentTheme()).toBe('dark');
    expect(b.getAttribute('aria-label')).toBe('Switch to light theme');
    expect(b.querySelector('svg')).not.toBeNull();
  });

  it('switches light ⇄ dark on click and remembers the choice', () => {
    const b = button();
    initThemeToggle(b);
    expect(currentTheme()).toBe('light');
    b.click();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(store.get('cp:theme')).toBe('dark');
    expect(b.getAttribute('aria-label')).toBe('Switch to light theme');
    b.click();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(store.get('cp:theme')).toBe('light');
  });

  it('applies a remembered choice over the system setting', () => {
    systemDark = true;
    store.set('cp:theme', 'light');
    const b = button();
    initThemeToggle(b);
    expect(currentTheme()).toBe('light');
    expect(b.getAttribute('aria-label')).toBe('Switch to dark theme');
  });
});
