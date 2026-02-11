import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate', // Updates app automatically when new version deployed
      injectManifest: {
        //swDest: 'dist/sw.js',       // Where it ends up after build
        injectionPoint: undefined
      },
      workbox: {
        // --- ADD OR UPDATE THIS SECTION ---
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,webmanifest}', // <-- Ensure .png and .svg are included
        ],
        // ---------------------------------
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'HELPDESK',
        short_name: 'HDOL',
        description: 'A simple progressive web app built with React + Vite',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})
