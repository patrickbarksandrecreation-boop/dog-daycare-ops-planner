import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: '/',
        name: 'Daycare Planner — DEMO / NOT LIVE',
        short_name: 'Daycare DEMO',
        description: 'Synthetic-only dog group planner. Local demo; not live attendance.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#173d35',
        background_color: '#f5f5ef',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      includeAssets: ['icons/*.png', 'icons/icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
        cleanupOutdatedCaches: true,
        // Keep the current app running until the user accepts the update.
        skipWaiting: false,
        clientsClaim: false,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/assets\//, /^\/icons\//, /\.[^/]+$/],
        // Only build assets are precached. No runtime or dog-data caching.
        runtimeCaching: [],
      },
    }),
  ],
})
