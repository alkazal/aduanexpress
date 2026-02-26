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
        name: 'ADUAN EXPRESS',
        short_name: 'AduanExpress',
        description: 'AduanExpress is a streamlined digital ticketing and reporting platform designed to simplify the process of submitting, tracking, and managing Aduan (complaints) for users across various agencies. With a user-friendly interface and robust features, AduanExpress empowers individuals to easily report issues, monitor their status, and receive timely updates, fostering greater accountability and responsiveness from agencies.',
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
