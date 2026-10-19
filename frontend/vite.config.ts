import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const proxy = { '/api': { target: process.env.SPLITNEST_API_TARGET ?? 'http://127.0.0.1:8080' } };

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    maxWorkers: 2,
  },
});
