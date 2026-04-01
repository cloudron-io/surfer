// vite.config.js

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue()
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/_admin': 'http://localhost:3000',
      '/assets': 'http://localhost:3000'
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
