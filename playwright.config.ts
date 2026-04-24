import { defineConfig, devices } from "@playwright/test";

/**
 * Configuração base do Playwright para testes E2E.
 *
 * Como rodar localmente:
 *   bun add -D @playwright/test
 *   bunx playwright install chromium
 *   bunx playwright test           # headless
 *   bunx playwright test --ui      # modo interativo
 *   bunx playwright show-report    # ver resultado
 *
 * Variáveis necessárias (crie um .env.test ou exporte):
 *   E2E_BASE_URL          → ex: http://localhost:5173 (default) ou https://readifybook.lovable.app
 *   E2E_TEST_EMAIL        → e-mail de um usuário de teste
 *   E2E_TEST_PASSWORD     → senha do usuário de teste
 *
 * IMPORTANTE: crie um usuário só para testes E2E em /auth e use as
 * credenciais dele aqui. NUNCA use sua conta real.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
  ],
  // Para rodar contra dev local automaticamente, descomente:
  // webServer: {
  //   command: "bun run dev",
  //   url: "http://localhost:5173",
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 60_000,
  // },
});
