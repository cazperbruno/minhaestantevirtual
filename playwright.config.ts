import { defineConfig, devices } from "@playwright/test";

/**
 * Readify E2E baseline.
 *
 * Public/safety smoke tests always run. Authenticated journeys run when the
 * dedicated E2E credentials are configured.
 *
 * A mesma base web/PWA é validada nos três alvos do produto:
 * desktop, Android-class Chromium e iOS-class WebKit. Smoke tests nativos de
 * Capacitor entram em uma etapa separada quando android/ e ios/ forem gerados.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 7_500 },
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "android-chromium",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "ios-webkit",
      use: { ...devices["iPhone 15"] },
    },
  ],
});
