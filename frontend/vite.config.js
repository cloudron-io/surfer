// vite.config.js

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import fs from 'fs';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
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
          if (url.startsWith('/@') || url.startsWith('/node_modules/')) return url;
          const filePath = path.join(import.meta.dirname, url);
          if (url && url !== '/' && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return url;
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
        protected: './protected.html'
      }
    },
    outDir: '../dist',
    emptyOutDir: true, // by default false for outDir outside current folder
    chunkSizeWarningLimit: 5000,  // really don't care so avoid warning
  },
});
