import { defineConfig, devices } from '@playwright/test';

// Puerto propio para no chocar con otra app en 5173. La API de pruebas sube con el límite de login
// relajado (la suite hace muchos inicios de sesión desde la misma IP).
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5199);
const API_PORT = Number(process.env.PORT ?? 3000);

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1, // comparten una sola BD
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'es-GT',
    timezoneId: 'America/Guatemala',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev -w api',
      cwd: '../..',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: true,
      timeout: 60_000,
      env: { RATE_LIMIT_AUTH_PER_MIN: '1000' },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: '..',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
