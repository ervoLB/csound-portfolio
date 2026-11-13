import { defineConfig, devices } from '@playwright/test';

/**
 * Two servers:
 *  - the dev server (engine test page under dev/), and
 *  - the production build served under a sub-path, like GitHub Pages
 *    (https://<user>.github.io/<repo>/).
 */
export const SUBPATH = '/csound-portfolio/';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--autoplay-policy=user-gesture-required'] } },
    },
    // Run with: npx playwright test --project=firefox --project=webkit
    // (install the browsers once with: npx playwright install firefox webkit)
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: /(site|layouts)\.spec\.ts/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: /(site|layouts)\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'npx vite --port 5199 --strictPort',
      url: 'http://localhost:5199/dev/engine.html',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `npx vite build && npx vite preview --port 5200 --strictPort --base ${SUBPATH}`,
      url: `http://localhost:5200${SUBPATH}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
