import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_TEST_EMAIL || "";
const PASSWORD = process.env.E2E_TEST_PASSWORD || "";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/auth");
  await page.getByLabel(/e-?mail/i).fill(EMAIL);
  await page.getByLabel(/senha/i).fill(PASSWORD);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/(?:|index|onboarding)/, { timeout: 10_000 });
}

test.describe("Clubes", () => {
  test.skip(!EMAIL || !PASSWORD, "Credenciais E2E não configuradas");

  test("listar clubes públicos", async ({ page }) => {
    await login(page);
    await page.goto("/clubes");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
