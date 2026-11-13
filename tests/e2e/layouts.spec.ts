import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { LAYOUTS as LAYOUT_TABLE } from '../../site/layouts';

const BASE = 'http://localhost:5200/csound-portfolio/';
const LAYOUTS = ['panel', 'manpage'] as const;

async function level(page: Page): Promise<number> {
  return page.evaluate(() => {
    const bars = [...document.querySelectorAll<HTMLElement>('.cp-level__bar')];
    return Math.max(0, ...bars.map((b) => parseFloat(b.style.getPropertyValue('--cp-level')) || 0));
  });
}

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function seriousViolations(page: Page, include?: string) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} → ${v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')} ${n.failureSummary?.split('\n')[1] ?? ''}`).join(' | ')}`);
}

test.describe('layouts', () => {
  for (const layout of LAYOUTS) {
    test(`${layout}: plays, keeps controls usable, fits a phone`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto(`${BASE}?layout=${layout}`);
      await expect(page.locator('html')).toHaveAttribute('data-layout', layout);
      const player = page.locator('csound-player');
      await expect(player).toHaveAttribute('chrome', LAYOUT_TABLE[layout].chrome);
      await expect(player).toHaveAttribute('controls', LAYOUT_TABLE[layout].controls);

      await page.locator('.card', { hasText: 'Algo Synth' }).click();
      await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
      await expect.poll(() => level(page), { timeout: 10_000 }).toBeGreaterThan(5);
      await expect(page.locator('.cp-statusline')).toContainText('algo_synth.csd');

      const tempo = page.getByRole('slider', { name: 'Tempo (BPM)' });
      await expect(tempo).toHaveAttribute('aria-valuenow', '120');
      await tempo.focus();
      await page.keyboard.press('ArrowUp');
      await expect(tempo).toHaveAttribute('aria-valuenow', '121');

      // The page carries no footer, running heads, control counts or file links any more.
      await expect(page.locator('.site-footer, .runhead')).toHaveCount(0);
      await expect(page.locator('#instrument-info')).not.toContainText(/controls|Open \.csd|Copy link/);
      await expect(page.locator('.stage__facts')).toHaveText('released 2026-11');
      await expect(page.locator('.stage__meta .tag')).toHaveCount(3); // tags stay

      await page.setViewportSize({ width: 400, height: 800 });
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }

  test('a double-clicked value can be typed', async ({ page }) => {
    for (const layout of LAYOUTS) {
      await page.goto(`${BASE}?layout=${layout}`);
      await page.locator('.card', { hasText: 'Algo Synth' }).click();
      await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
      const tempo = page.getByRole('slider', { name: 'Tempo (BPM)' });
      const cell = page.locator('.cp-widget', { has: tempo });
      await cell.locator('.cp-value').dblclick();
      const field = page.getByRole('textbox', { name: 'Tempo (BPM) value' });
      await expect(field).toBeFocused();
      await field.fill('90');
      await field.press('Enter');
      await expect(tempo).toHaveAttribute('aria-valuenow', '90');
      await expect(tempo).toBeFocused();
      // Out of range is clamped; Escape cancels without stopping the sound.
      await page.keyboard.press('Enter'); // Enter on the control opens the field too
      await field.fill('900');
      await field.press('Enter');
      await expect(tempo).toHaveAttribute('aria-valuenow', '200');
      await page.keyboard.press('Enter');
      await field.fill('5');
      await field.press('Escape');
      await expect(tempo).toHaveAttribute('aria-valuenow', '200');
      await expect(page.locator('.cp-status')).toHaveText(/Playing/);
    }
  });

  test('the switcher changes layout in place and is remembered', async ({ page }) => {
    await page.goto(`${BASE}?layouts`);
    const bar = page.getByRole('group', { name: 'Layout preview' });
    await expect(bar).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'panel');
    await page.evaluate(() => ((window as unknown as { marker: number }).marker = 42));
    await bar.getByRole('button', { name: 'man page' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'manpage');
    await expect(page.locator('csound-player')).toHaveAttribute('controls', 'text');
    await expect(page).toHaveURL(/layout=manpage/);
    expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(42); // no reload

    await page.keyboard.press('Alt+Digit1');
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'panel');
    await page.keyboard.press('Alt+Digit0');
    await expect(bar).toBeHidden();

    await page.goto(`${BASE}?layouts`);
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'panel');
  });

  test('without ?layouts the site shows the configured layout and no switcher', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'panel');
    await expect(page.locator('.layout-switcher')).toHaveCount(0);
  });

  test('panel: the instrument list folds away, filters in a closed box, descriptions on hover', async ({ page }) => {
    await page.goto(`${BASE}?layout=panel#/sub_synth`);
    const card = page.locator('.card', { hasText: 'Vibrato Synth' });
    await expect(card).toBeVisible();
    // Cards: the name only (no control counts); the description is in the readout on hover.
    expect((await card.locator('.card__desc').boundingBox())?.width ?? 0).toBeLessThanOrEqual(1); // visually hidden, still in the name
    // The readout keeps its place: the current instrument until something is hovered.
    const readout = page.locator('#rack-readout');
    await expect(readout).toContainText('Subtractive synth');
    const height = (await readout.boundingBox())!.height;
    await card.hover();
    await expect(readout).toContainText('A sine oscillator with vibrato');
    // Keyboard focus survives a passing mouse.
    await page.mouse.move(800, 10);
    await page.locator('.card', { hasText: 'Algo Synth' }).focus();
    await expect(readout).toContainText('generative pentatonic');
    await card.hover();
    await page.mouse.move(800, 10);
    await expect(readout).toContainText('generative pentatonic');
    expect(Math.abs((await readout.boundingBox())!.height - height)).toBeLessThan(40);

    // The tag filter is a closed box that shows the active tag when closed.
    const filter = page.locator('#tag-details');
    await expect(filter).not.toHaveAttribute('open', '');
    await expect(page.getByRole('button', { name: 'chnset', exact: true })).toBeHidden();
    await filter.locator('summary').click();
    await expect(page.getByRole('button', { name: 'Timeline' })).toBeVisible(); // stays reachable
    await page.getByRole('button', { name: 'chnset', exact: true }).click();
    await expect(page.locator('.card')).toHaveCount(1);
    await expect(page.locator('#instrument-count')).toHaveText('1/7');
    await filter.locator('summary').click();
    await expect(filter.locator('summary')).toContainText('Filter: chnset');

    // Folding the list.
    const toggle = page.locator('#rack-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const stageBefore = (await page.locator('.stage').boundingBox())!.width;
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#rack-body')).toBeHidden();
    expect((await page.locator('.stage').boundingBox())!.width).toBeGreaterThan(stageBefore + 100);
    await page.reload();
    await expect(page.locator('#rack-toggle')).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#rack-toggle').click();
    await expect(page.locator('#rack-body')).toBeVisible();
  });

  test('man page: HISTORY folds, [x] info shows descriptions, the text keyboard plays', async ({ page }) => {
    await page.goto(`${BASE}?layout=manpage#/sub_synth`);
    // Names only until info is checked.
    const desc = page.locator('.card', { hasText: 'Vibrato Synth' }).locator('.card__desc');
    await expect(desc).toBeHidden();
    await page.getByRole('checkbox', { name: 'info' }).check();
    await expect(desc).toBeVisible();
    await expect(page.locator('.card__tags').first()).toBeHidden(); // descriptions only
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'info' })).toBeChecked();

    await page.getByRole('button', { name: 'Timeline' }).click();
    await expect(page.locator('#rack-title-text')).toHaveText('History');
    await page.locator('#rack-toggle').click();
    await expect(page.locator('#rack-body')).toBeHidden();
    await expect(page.locator('#rack-title')).toBeVisible();
    await page.locator('#rack-toggle').click();

    // The player is wider than the 80-column text.
    const text = (await page.locator('.stage__desc').boundingBox())!.width;
    const host = (await page.locator('.stage csound-player').boundingBox())!.width;
    expect(host).toBeGreaterThan(text + 200);

    {
      await page.goto(`${BASE}?layout=manpage#/sub_synth`);
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
      await expect(page.locator('.cp-midi-art')).toBeVisible();
      const c4 = page.getByRole('button', { name: 'C4', exact: true });
      await c4.scrollIntoViewIfNeeded();
      await c4.hover();
      await page.mouse.down();
      await expect.poll(() => level(page), { timeout: 10_000 }).toBeGreaterThan(5);
      await expect(page.locator('.cp-midi-art b').first()).toBeVisible();
      await expect(c4).toHaveAttribute('aria-pressed', 'true');
      await page.mouse.up();
      {
        // The drawing's top frame is not a key; the black key starts below it.
        const art = (await page.locator('.cp-midi-art').boundingBox())!;
        const row = art.height / 7;
        const hit = (x: number, y: number) =>
          page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('[data-note]')?.getAttribute('aria-label') ?? null, [x, y]);
        const cs3 = (await page.getByRole('button', { name: 'C#3', exact: true }).boundingBox())!;
        expect(await hit(cs3.x + cs3.width / 2, art.y + row * 0.5)).toBeNull();
        expect(await hit(cs3.x + cs3.width / 2, art.y + row * 2)).toBe('C#3');
        // It fits a phone-width board without sideways scrolling.
        await page.setViewportSize({ width: 400, height: 800 });
        await page.waitForTimeout(200);
        const kb = page.locator('.cp-midi-keyboard');
        expect(await kb.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
      }
    }
  });

  test('header: profile, title and bio; no links; a theme icon in the top right', async ({ page }) => {
    for (const layout of LAYOUTS) {
      await page.goto(`${BASE}?layout=${layout}`);
      await expect(page.locator('.site-link')).toHaveCount(0);
      const icon = (await page.locator('#theme-toggle').boundingBox())!;
      const width = page.viewportSize()!.width;
      expect(icon.width).toBeLessThan(40);
      expect(icon.x + icon.width).toBeGreaterThan(width - 60);
      expect(icon.y).toBeLessThan(60);
    }
    // Man page: AUTHOR holds the name, the photo, then "title — bio"; there is no NAME section.
    await page.goto(`${BASE}?layout=manpage`);
    const head = await page.locator('.site-id').evaluate((e) => getComputedStyle(e, '::before').content);
    expect(head).toContain('AUTHOR');
    const order = await page.evaluate(() =>
      ['site-author', 'site-profile', 'site-title', 'site-bio'].map((id) => document.getElementById(id)!.getBoundingClientRect().top),
    );
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  test('profile: the photo from portfolio.json ships with the build; initials stand in without one', async ({ page }) => {
    // portfolio.json → "avatar": "profile.png", copied into the built site.
    await page.goto(BASE);
    const photo = page.locator('#site-avatar');
    await expect(photo).toBeVisible();
    await expect(photo).toHaveAttribute('src', /profile\.png$/);
    await expect(photo).toHaveAttribute('alt', 'Photo of Your Name');
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('#site-initials')).toBeHidden();

    // No photo: the initials.
    const withAvatar = async (avatar: string | undefined) => {
      await page.unroute('**/portfolio.json');
      await page.route('**/portfolio.json', async (route) => {
        const response = await route.fetch();
        const json = await response.json();
        await route.fulfill({ response, json: { ...json, avatar } });
      });
      await page.reload();
    };
    await withAvatar(undefined);
    await expect(page.locator('#site-author')).toHaveText('Your Name');
    await expect(page.locator('#site-initials')).toHaveText('YN');
    await expect(photo).toBeHidden();

    // A photo that doesn't load: the initials too.
    await withAvatar('missing.png');
    await expect(page.locator('#site-initials')).toHaveText('YN');
    await expect(photo).toBeHidden();
  });

  test('minimal chrome: the More menu holds the secondary actions', async ({ page }) => {
    await page.goto(`${BASE}?layout=manpage`);
    await page.locator('.card', { hasText: 'Sub Synth' }).click();
    await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
    const more = page.getByRole('button', { name: 'More' });
    const panel = page.locator('.cp-more__panel');
    await expect(panel).toBeHidden();
    await more.click();
    await expect(panel.getByRole('slider', { name: 'Volume', exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Download .csd' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(more).toBeFocused();
    await expect(page.locator('.cp-status')).toHaveText(/Playing/);
  });

  test('timeline: groups instruments by release year and is remembered', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Timeline' }).click();
    await expect(page.locator('.rack__year')).toHaveText(['2026', '2025']);
    await expect(page.getByRole('heading', { name: '2025' })).toBeVisible();
    await expect(page.getByRole('list', { name: '2025' }).getByRole('button')).toHaveCount(4);
    await expect(page.locator('#rack-title')).toContainText('Timeline');
    await page.reload();
    await expect(page.locator('.rack__year')).toHaveCount(2);
    await page.getByRole('button', { name: 'List' }).click();
    await expect(page.locator('.rack__year')).toHaveCount(0);
    await expect(page.locator('.card')).toHaveCount(7);
  });
});

test('a layout\'s board position wins over a choice saved under another layout', async ({ page }) => {
  await page.goto(BASE); // panel: controls next to the code (portfolio.json)
  await page.locator('.card', { hasText: 'Algo Synth' }).click();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Controls below the code' }).click();
  await expect(page.locator('.cp-player')).toHaveClass(/board-bottom/);
  await page.reload();
  await expect(page.locator('.cp-player')).toHaveClass(/board-bottom/); // remembered in panel
  await page.goto(`${BASE}?layout=manpage`);
  await expect(page.locator('.cp-player')).toHaveClass(/board-bottom/);
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Controls next to the code' }).click();
  await page.goto(`${BASE}?layout=panel`);
  // panel's default (right) differs from the man page's, so the man page choice doesn't carry over.
  await expect(page.locator('.cp-player')).toHaveClass(/board-right/);
});

test.describe('layout accessibility', () => {
  for (const layout of LAYOUTS) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`${layout} (${scheme}) has no serious accessibility problems`, async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium', 'axe runs once, in Chromium');
        await page.emulateMedia({ colorScheme: scheme });
        await page.addInitScript((s) => localStorage.setItem('cp:theme', s), scheme);
        await page.goto(`${BASE}?layout=${layout}`);
        await page.locator('.card', { hasText: 'Sub Synth' }).click();
        await expect(page.locator('.cp-status')).toHaveText(/Playing/, { timeout: 30_000 });
        await page.locator('#tag-details summary').click();
        if (layout === 'manpage') await page.getByRole('checkbox', { name: 'info' }).check();
        await page.getByRole('button', { name: 'Output', exact: true }).click();
        await page.locator('.cp-widget--knob .cp-value, .cp-tfader .cp-value').first().dblclick();
        await expect(page.locator('.cp-value-input')).toBeVisible();
        expect(await seriousViolations(page)).toEqual([]);
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'More' }).click();
        expect(await seriousViolations(page)).toEqual([]);
      });
    }
  }

  for (const layout of LAYOUTS) {
    test(`${layout}: an error on the status line stays readable`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'axe runs once, in Chromium');
      await page.goto(`${BASE}play.html?layout=${layout}`);
      await page.waitForFunction(() => customElements.get('csound-player'));
      const bad = '<CsoundSynthesizer>\n<CsInstruments>\ninstr 1\n a1 = nosuchopcode(1)\nendin\n</CsInstruments>\n<CsScore>\ni 1 0 1\n</CsScore>\n</CsoundSynthesizer>';
      await page.evaluate(async (c) => (document.getElementById('player') as unknown as { load(s: unknown): Promise<boolean> }).load({ code: c }), bad);
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(page.locator('.cp-statusline .cp-status')).toHaveText(/Error/, { timeout: 30_000 });
      expect(await seriousViolations(page, '.cp-statusline')).toEqual([]);
    });
  }
});
