import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        /**
         * Chunk filenames are derived from the entry module's name by default,
         * which would put `Conversation-a1b2c3.js` and `LockScreen-d4e5f6.js`
         * in the network tab of a site that presents itself as a collection of
         * revision notes. The names are the giveaway, not the code — the code
         * is never fetched unless a valid access code is entered.
         *
         * So: hash only. Every lazily loaded chunk is anonymous, and the
         * network tab of an unlocked visit shows nothing but the site itself.
         */
        chunkFileNames: 'assets/[hash].js',
        entryFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash][extname]',

        // Firebase is by far the heaviest dependency, and it is only needed
        // once a code has been submitted. Splitting it keeps the public site's
        // critical path small — the notes paint before ~120 KB of SDK would
        // otherwise have to be parsed, and on an ordinary visit it is never
        // requested at all.
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'vendor-a';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'vendor-b';
          }
          // The animation runtime. Only ever imported from modules behind the
          // access code, so it lands in its own chunk that a visitor who never
          // unlocks does not fetch — same rationale as vendor-a. Kept separate
          // so it stays cached across deploys that only touch app code.
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) {
            return 'vendor-c';
          }
          return undefined;
        },
      },
    },
  },
});
