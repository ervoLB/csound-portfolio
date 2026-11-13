/**
 * Light / dark switch: a small sun/moon button. Until it is clicked the page
 * follows the system setting; a click picks the other theme and is remembered.
 */
type Theme = 'light' | 'dark';

const SUN =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
const MOON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7z"/></svg>';

function stored(): Theme | null {
  try {
    const t = localStorage.getItem('cp:theme');
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The theme in effect: the visitor's choice, else the system's. */
export function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  return chosen === 'light' || chosen === 'dark' ? chosen : systemTheme();
}

function render(button: HTMLElement) {
  const theme = currentTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  // The icon shows what a click switches to.
  button.innerHTML = next === 'dark' ? MOON : SUN;
  button.setAttribute('aria-label', `Switch to ${next} theme`);
  button.title = `Switch to ${next} theme`;
  button.dataset.theme = theme;
}

export function initThemeToggle(button: HTMLElement) {
  const chosen = stored();
  if (chosen) document.documentElement.dataset.theme = chosen;
  render(button);
  button.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('cp:theme', next);
    } catch {
      /* not remembered */
    }
    render(button);
  });
  // While following the system, keep the icon in step with it.
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => render(button));
  }
}
