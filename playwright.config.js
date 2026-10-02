import { defineConfig } from '@playwright/test';

// One worker on the real GPU. Every browser is muted: the owner uses this laptop while tests run.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5300',
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] },
  },
  webServer: process.env.BASE_URL ? undefined : { command: 'npm run dev', port: 5300, reuseExistingServer: true, timeout: 60000 },
});
