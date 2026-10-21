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
        // Firebase is by far the heaviest dependency. Splitting it keeps the
        // lock screen's critical path small: the app shell paints before the
        // SDK is parsed, and the SDK is only fetched once the user unlocks.
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'react';
          }
          // The animation runtime. Only ever imported from modules behind the
          // lock screen, so it lands in its own chunk that is not fetched until
          // someone unlocks — same rationale as firebase. Kept separate so it
          // stays cached across deploys that only touch app code.
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) {
            return 'motion';
          }
          return undefined;
        },
      },
    },
  },
});
