import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { portfolio } from './scripts/vitePortfolio';

export default defineConfig({
  // Relative base: the built site works at https://<user>.github.io/<repo>/ and anywhere else.
  base: './',
  plugins: [react(), portfolio()],
  build: {
    target: 'es2022',
    // Browsers without CSS nesting: esbuild flattens the nested layout rules for these targets.
    cssTarget: ['chrome100', 'firefox100', 'safari15'],
    // The code editor is a separate, lazily loaded chunk (~190 kB gzipped).
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        play: resolve(__dirname, 'play.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'player/**/*.test.ts', 'player/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
