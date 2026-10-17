import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    // terra.js / feather.js expect Node builtins (buffer, stream, events…)
    // in the browser. Without these shims the bundle crashes on load
    // (black screen) — e.g. unresolved "@terra-money/terra.proto/…" imports.
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  server: {
    // In local dev, proxy API calls to the game server (server/ folder).
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
