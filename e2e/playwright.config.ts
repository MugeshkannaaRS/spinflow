import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 2 * 60 * 1000,
  retries: 1,
  use: {
    baseURL: 'https://spinflow-f.onrender.com',
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 30_000,
    ignoreHTTPSErrors: true,
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  reporter: [['list'], ['html', { open: 'never' }]]
});
