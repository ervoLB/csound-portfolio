import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const BASE = 'http://localhost:5200/csound-portfolio/';

/** Output level (0..100) read from the toolbar meter. */
async function level(page: Page): Promise<number> {
  return page.evaluate(() => {
    const bars = [...document.querySelectorAll<HTMLElement>('.cp-level__bar')];
    return Math.max(0, ...bars.map((b) => parseFloat(b.style.getPropertyValue('--cp-level')) || 0));
  });
}

async function waitForSound(page: Page, timeout = 10_000) {
  await expect.poll(() => level(page), { timeout }).toBeGreaterThan(5);
}

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test.describe('portfolio site (production build under a sub-path)', () => {
  test('lists instruments, plays them, loads Csound once', async ({ page }) => {
    const errors = trackErrors(page);
    const wasm: string[] = [];
    page.on('request', (r) => {
      if (r.url().endsWith('.wasm')) wasm.push(r.url());
    });
    await page.goto(BASE);
    await expect(page.locator('.card')).toHaveCount(7);
    await expect(page.locator('#instrument-title')).toHaveText('Algo Synth'); // first instrument preselected
    await expect(page.locator('.cp-status')).toHaveText(/Ready/); // no autoplay without a click

    await page.locator('.card', { hasText: 'Algo Synth' }).click();
    await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
    await waitForSound(page);
    await expect(page.getByRole('slider', { name: 'Tempo (BPM)' })).toHaveAttribute('aria-valuenow', '120');

    // Switch instruments: Sub Synth is silent until a key is played.
    await page.locator('.card', { hasText: 'Sub Synth' }).click();
    await expect(page.locator('#instrument-title')).toHaveText('Sub Synth');
    await expect(page.locator('.cp-status')).toHaveText(/Playing/);
    await expect(page).toHaveURL(/#\/sub_synth$/);
    await page.getByRole('button', { name: 'C4', exact: true }).hover();
    await page.mouse.down();
    await waitForSound(page);
    await page.mouse.up();

    expect(wasm).toHaveLength(1);
    expect(wasm[0]).toContain('unpkg.com/@csound/wasm-bin@7.0.0/lib/csound.wasm');
    expect(errors).toEqual([]);
  });

  test('adds an on-screen keyboard to MIDI instruments that do not declare one', async ({ page }) => {
    const errors = trackErrors(page);
    // The site's examples all declare a keyboard, so load the fixture piano (MIDI through massign, no keyboard widget).
    await page.goto(`${BASE}play.html`);
    await page.waitForFunction(() => customElements.get('csound-player'));
    const load = (code: string) =>
      page.evaluate(async (c) => (document.getElementById('player') as unknown as { load(s: unknown): Promise<boolean> }).load({ code: c }), code);
    await load(readFileSync('tests/fixtures/instruments/grand_piano.csd', 'utf8'));
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
    await expect(page.locator('[data-widget-id="__auto_keyboard"]')).toBeVisible();
    await page.getByRole('button', { name: 'C4', exact: true }).hover();
    await page.mouse.down();
    await waitForSound(page); // short plucked note: the meter's peak hold keeps it visible
    await page.mouse.up();
    // Algo Synth is not a MIDI instrument: no keyboard is added.
    await load(readFileSync('tests/fixtures/instruments/algo_synth.csd', 'utf8'));
    await expect(page.locator('[data-widget-id="__auto_keyboard"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('plays MIDI instruments from the computer keyboard right after choosing them', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('.card', { hasText: 'Sub Synth' }).click();
    await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
    await page.keyboard.down('KeyA'); // "A" is C4
    await waitForSound(page);
    await page.keyboard.up('KeyA');
    // Typing in the editor must not play notes.
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('; asdf');
    await expect(page.locator('.cm-content')).toContainText('; asdf');
  });

  test('a label on a chnset line prints the value Csound sends', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('.card', { hasText: 'Level Meter' }).click();
    await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
    const label = page.locator('.cp-label--live');
    // A -3 dB sawtooth has an RMS of about 0.4; before sound arrives the label reads 0.000.
    await expect(label).toHaveText(/^RMS: 0\.(?!000)\d{3}$/, { timeout: 10_000 });
    // Quieter output gives a smaller number.
    const before = Number((await label.textContent())!.slice(5));
    const amp = page.getByRole('slider', { name: 'Amplitude [dB]' });
    await amp.focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press('PageDown');
    await expect.poll(async () => Number((await label.textContent())!.slice(5)), { timeout: 5_000 }).toBeLessThan(before / 2);
  });

  test('deep link selects an instrument without playing it', async ({ page }) => {
    await page.goto(`${BASE}#/vibrato_synth`);
    await expect(page.locator('#instrument-title')).toHaveText('Vibrato Synth');
    await expect(page.locator('.card[aria-current="true"]')).toContainText('Vibrato Synth');
    await expect(page.locator('.cp-status')).toHaveText(/Ready/);
  });

  test('editing code and applying changes recompiles; errors point at the line', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('.card', { hasText: 'Algo Synth' }).click();
    await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
    // Break the code: append junk to "kTrig metro kTickRate".
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+f');
    await page.keyboard.type('kTrig metro kTickRate');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape'); // closes search, keeps the match selected
    await page.keyboard.press('End');
    await page.keyboard.type(' oops_not_valid');
    await expect(page.getByRole('button', { name: 'Apply changes' })).toBeVisible();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.locator('.cp-status')).toHaveText(/Error/, { timeout: 15_000 });
    await expect(page.locator('.cp-console')).toContainText('oops_not_valid');
    await expect.poll(() => page.locator('.cm-lint-marker-error').count()).toBeGreaterThan(0);
    // Reset brings the original code back, and it plays again.
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Reset code' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('.cp-status')).toHaveText(/Playing/);
  });

  test('controls can move below the code, and the choice is remembered', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('.cp-player')).toHaveClass(/cp-player--board-right/);
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Controls below the code' }).click();
    await expect(page.locator('.cp-player')).toHaveClass(/cp-player--board-bottom/);
    await page.reload();
    await expect(page.locator('.cp-player')).toHaveClass(/cp-player--board-bottom/);
  });

  test('theme icon switches light ⇄ dark and is remembered', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(BASE);
    const toggle = page.locator('#theme-toggle');
    await expect(toggle).toHaveAccessibleName('Switch to dark theme');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./); // follows the system
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAccessibleName('Switch to light theme');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(29, 28, 25)'); // the panel layout's dark enamel
  });

  test('play.html loads a CSD from a link', async ({ page }) => {
    await page.goto(`${BASE}play.html?src=${encodeURIComponent(`${BASE}instruments/algo_synth/algo_synth.csd`)}`);
    await expect(page.locator('.cp-statusline__file')).toHaveText('algo_synth.csd');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
    await waitForSound(page);
  });

  test('pressing Play right after the page opens works (startup race)', async ({ page }) => {
    const code = await (await fetch(`${BASE}instruments/algo_synth/algo_synth.csd`)).text();
    await page.goto(`${BASE}play.html`);
    await page.waitForFunction(() => customElements.get('csound-player'));
    await page.evaluate(async (c) => (document.getElementById('player') as unknown as { load(s: unknown): Promise<boolean> }).load({ code: c }), code);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('.cp-status')).toHaveText(/Starting|Loading Csound|Compiling|Playing/);
    await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
    await waitForSound(page);
  });

  test('Escape in the editor does not stop the sound; Escape on the controls does', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('.card', { hasText: 'Algo Synth' }).click();
    await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
    await page.locator('.cm-content').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.cp-status')).toHaveText(/Playing/);
    await page.getByRole('slider', { name: 'Tempo (BPM)' }).focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.cp-status')).toHaveText(/Stopped/);
  });

  test('computer-keyboard notes only play while the player has focus', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('.card', { hasText: 'Sub Synth' }).click();
    await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
    await page.locator('#theme-toggle').focus();
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(400);
    expect(await level(page)).toBe(0);
    await page.keyboard.up('KeyA');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./); // the key did nothing else either
  });

  test('loading an instrument into a second player stops the first one', async ({ page }) => {
    await page.goto(`${BASE}play.html?src=${encodeURIComponent(`${BASE}instruments/algo_synth/algo_synth.csd`)}`);
    await expect(page.locator('.cp-statusline__file')).toHaveText('algo_synth.csd');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
    await page.evaluate(() => {
      const second = document.createElement('csound-player');
      second.id = 'second';
      document.querySelector('main')!.append(second);
    });
    await page.evaluate(async (url) => (document.getElementById('second') as unknown as { load(u: string): Promise<boolean> }).load(url), `${BASE}instruments/sub_synth/sub_synth.csd`);
    await expect(page.locator('#player .cp-status')).not.toHaveText(/Playing/);
    await expect(page.locator('#player .cp-btn--transport')).toHaveAccessibleName('Play');
    await expect(page.locator('#second .cp-toolbar__name')).toHaveText('Sub Synth'); // a plain element: full toolbar
  });

  test('board and editor attributes can change after the page has loaded', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('.cp-player')).toHaveClass(/cp-player--board-right/);
    await page.evaluate(() => document.getElementById('player')!.setAttribute('board', 'bottom'));
    await expect(page.locator('.cp-player')).toHaveClass(/cp-player--board-bottom/);
    await page.evaluate(() => document.getElementById('player')!.setAttribute('editor', 'collapsed'));
    await expect(page.locator('.cp-player')).toHaveClass(/cp-player--no-editor/);
  });

  test('phone width: no horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE);
    await expect(page.locator('.card')).toHaveCount(7);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
});
