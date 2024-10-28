// vite.config.js

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue()
  ],
  // https://vitejs.dev/config/build-options
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, './index.html'),
        public: resolve(__dirname, './public.html'),
        protected: resolve(__dirname, './protected.html')
      }
    },
    outDir: '../dist',
    emptyOutDir: true, // by default false for outDir outside current folder
    chunkSizeWarningLimit: 5000,  // really don't care so avoid warning
  },
});
