import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registration comes from `virtual:pwa-register` in src/main.tsx, which also reloads open tabs onto a new version.
      injectRegister: false,
      manifest: {
        name: 'Solitaire',
        short_name: 'Solitaire',
        description: 'Ad-free Klondike solitaire. Every deal is winnable.',
        theme_color: '#0f0d0b',
        background_color: '#0f0d0b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 3_000_000,
        // Activate a new deploy's worker on install. Otherwise it waits for a SKIP_WAITING message that pages
        // running an older client never send, and returning players stay on the old version until every tab closes.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
