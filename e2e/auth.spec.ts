import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_TEST_EMAIL || "";
const PASSWORD = process.env.E2E_TEST_PASSWORD || "";

test.describe("Autenticação", () => {
  test.skip(!EMAIL || !PASSWORD, "E2E_TEST_EMAIL/PASSWORD não configurados");

  test("login com email/senha leva para home", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel(/e-?mail/i).fill(EMAIL);
    await page.getByLabel(/senha/i).fill(PASSWORD);
    await page.getByRole("button", { name: /entrar/i }).click();

    // Aguarda redirecionamento para home ou onboarding
    await page.waitForURL(/\/(?:|index|onboarding)/, { timeout: 10_000 });
    expect(page.url()).not.toContain("/auth");
  });

  test("rota protegida sem login redireciona para /auth", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/biblioteca");
    await page.waitForURL(/\/auth/);
    expect(page.url()).toContain("/auth");
  });
});
