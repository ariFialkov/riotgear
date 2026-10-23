import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths by default, so the built folder works at any URL or sub-path
  base: process.env.BASE_PATH || './',
  server: { port: 5173 },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
