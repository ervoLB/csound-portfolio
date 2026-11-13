import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const BASE = 'http://localhost:5200/csound-portfolio/';

for (const scheme of ['light', 'dark'] as const) {
  test(`portfolio page has no serious accessibility problems (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(BASE);
    await page.locator('.card', { hasText: 'Algo Synth' }).click();
    await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Output', exact: true }).click();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    expect(serious).toEqual([]);
  });
}

test('every widget type passes the accessibility check', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const code = readFileSync('tests/fixtures/all-widgets.csd', 'utf8');
  await page.goto(`${BASE}play.html`);
  await page.waitForFunction(() => customElements.get('csound-player'));
  await page.evaluate(async (c) => (document.getElementById('player') as unknown as { load(s: unknown): Promise<boolean> }).load({ code: c }), code);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
  const results = await new AxeBuilder({ page }).include('.cp-board').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(serious).toEqual([]);
});
