// vite.config.js

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import pankowPlugin from '@cloudron/pankow/vite-plugin';
import fs from 'fs';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    // The version check compares the page's build id against /build.json. In the dev
    // server /build.json is proxied to the backend and has the dist build id, so the
    // banner would always show. HMR already handles updates during development.
    pankowPlugin({ versionCheck: command === 'build' }),
    vue()
  ],
  server: {
    proxy: {
      // Forward everything to the backend (static files, folder listing, /api, /auth, ...).
      // Vite keeps serving its own frontend source files and internal modules.
      '/': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        bypass(req) {
          const url = (req.url || '').split('?')[0].split('#')[0];
          if (url.startsWith('/@') || url.startsWith('/node_modules/')) return req.url;
          if (url === '/' && (req.headers.accept || '').includes('text/html')) return '/welcome.html';
          // Production serves the built admin from /_admin, but in development that
          // is a stale dist build. Serve the live source page instead, also for the
          // OIDC returnTo.
          if (url === '/_admin' || url === '/_admin/') return '/admin.html';
          const filePath = path.join(import.meta.dirname, url);
          if (url && url !== '/' && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return req.url;
          // return undefined -> proxy to backend
        }
      }
    }
  },
  // https://vitejs.dev/config/build-options
  build: {
    rollupOptions: {
      input: {
        admin: './admin.html',
        public: './public.html',
        protected: './protected.html',
        welcome: './welcome.html'
      }
    },
    outDir: '../dist',
    emptyOutDir: true, // by default false for outDir outside current folder
    chunkSizeWarningLimit: 5000,  // really don't care so avoid warning
  },
}));
