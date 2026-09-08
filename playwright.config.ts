import { defineConfig, devices } from "@playwright/test";

/**
 * Readify E2E baseline.
 *
 * Public/safety smoke tests always run. Authenticated journeys run when the
 * dedicated E2E credentials are configured.
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
      // Android/Google Play is a first-class target for Readify. Keep a Chrome
      // mobile project in every E2E run so responsive regressions cannot hide.
      name: "android-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
