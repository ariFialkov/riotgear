import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  server: { port: 5173 },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
