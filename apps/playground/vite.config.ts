import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: [
      '@gotipe/wasm',
      '@gotipe/core',
      '@gotipe/react',
      '@gotipe/block-editor',
      '@gotipe/collaboration',
      '@gotipe/comments',
      '@gotipe/suggestions',
      '@gotipe/versions',
      '@gotipe/ai',
      '@gotipe/i18n',
      '@gotipe/theme',
      '@gotipe/export',
    ],
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['host.docker.internal'],
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': {
        target: 'ws://localhost:8081',
        ws: true,
      },
    },
  },
});
