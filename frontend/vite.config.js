import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Configuração que transforma o site num app instalável e funcional offline
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icone-192.png', 'icone-512.png'],
      manifest: {
        name: 'Estoque Fácil',
        short_name: 'Estoque',
        description: 'Controle de estoque para lojas de bebidas',
        theme_color: '#0F3D2E',
        background_color: '#0F3D2E',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Garante que o app abra mesmo sem internet, usando o cache local
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
