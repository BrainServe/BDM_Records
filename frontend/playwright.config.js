import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',
  timeout:45000,
  retries:process.env.CI?1:0,
  workers:1, // Tests create/delete data in a shared ephemeral database.
  use:{baseURL:'http://localhost:5173',...devices['Desktop Chrome'],acceptDownloads:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
  reporter:process.env.CI?'github':'list',
  webServer:{command:'npm run dev -- --host 0.0.0.0',url:'http://localhost:5173',reuseExistingServer:!process.env.CI,timeout:120000},
});
