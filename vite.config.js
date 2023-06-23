// vite.config.js

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const path = require("path");

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, './index.html'),
        public: path.resolve(__dirname, './public.html'),
        protected: path.resolve(__dirname, './protected.html')
      }
    }
  }
})
