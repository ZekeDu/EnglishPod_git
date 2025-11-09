import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: [
    {
      command: 'npm run dev:api:4001',
      url: 'http://localhost:4001/lessons',
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: 'npm run dev:web:4001',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 60000,
    },
  ],
});

