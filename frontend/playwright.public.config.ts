import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

if (!process.env.SPLITNEST_WEB_URL?.startsWith('https://')) {
  throw new Error('Set SPLITNEST_WEB_URL to the public HTTPS application address.');
}

// Free-host CPU and network latency need larger budgets, with the same assertions.
export default defineConfig({
  ...baseConfig,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  metadata: { ...baseConfig.metadata, publicHost: true },
  use: { ...baseConfig.use, navigationTimeout: 90_000, actionTimeout: 30_000 },
});
