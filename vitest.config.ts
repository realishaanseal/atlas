import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Node, not jsdom: everything under test is Web Crypto and plain data.
    // Node 20+ provides crypto.subtle globally, so a DOM shim would add
    // dependencies and startup cost for nothing.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // PBKDF2 at 2M iterations is deliberately slow, and several tests derive
    // keys more than once.
    testTimeout: 30_000,
  },
});
