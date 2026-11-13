import { expect, test } from '@playwright/test';

test('engine plays real audio in Chromium, loads the wasm once and switches instruments', async ({ page }) => {
  const wasmRequests: string[] = [];
  page.on('request', (req) => {
    if (req.url().endsWith('.wasm')) wasmRequests.push(req.url());
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://localhost:5199/dev/engine.html');
  // Background preload finishes without any user gesture.
  await expect(page.locator('#wasm')).toHaveText(/loaded 100%/, { timeout: 30_000 });
  expect(wasmRequests).toHaveLength(1);
  expect(wasmRequests[0]).toContain('unpkg.com/@csound/wasm-bin@7.0.0/lib/csound.wasm');

  await page.click('#play-a');
  await expect(page.locator('#state')).toHaveText('playing', { timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__maxPeak() > 0.2, null, { timeout: 10_000 });
  const sampleRate = await page.evaluate(() => (window as any).__engine.sampleRate);
  expect(sampleRate).toBeGreaterThan(0);

  // Channel control from the range input.
  await page.evaluate(() => (window as any).__resetPeak());
  await page.locator('#amp').fill('0');
  await page.waitForTimeout(300);
  await page.evaluate(() => (window as any).__resetPeak());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__maxPeak())).toBeLessThan(0.01);

  // Switch to the MIDI instrument: silent until a note arrives.
  await page.click('#play-b');
  await expect(page.locator('#state')).toHaveText('playing');
  expect(await page.evaluate(() => (window as any).__engine.midiEnabled)).toBe(true);
  await page.evaluate(() => (window as any).__engine.midi(0x90, 60, 110));
  await page.evaluate(() => (window as any).__resetPeak());
  await page.waitForFunction(() => (window as any).__maxPeak() > 0.1, null, { timeout: 10_000 });

  await page.click('#stop');
  await expect(page.locator('#state')).toHaveText('stopped');

  // Back to A: still only one wasm request for the whole session.
  await page.click('#play-a');
  await expect(page.locator('#state')).toHaveText('playing');
  expect(wasmRequests).toHaveLength(1);
  expect(errors).toEqual([]);
});
