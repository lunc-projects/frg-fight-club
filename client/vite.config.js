import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // In local dev, proxy API calls to the game server (server/ folder).
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
