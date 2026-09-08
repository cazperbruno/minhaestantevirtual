import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_TEST_EMAIL || "";
const PASSWORD = process.env.E2E_TEST_PASSWORD || "";
const HAS_AUTH_CREDS = Boolean(EMAIL && PASSWORD);

test.describe("Autenticação e rotas públicas", () => {
  test("tela de login carrega com um único CTA Google e links legais", async ({ page }) => {
    await page.goto("/auth");

    await expect(page.getByRole("heading", { name: "Readify" })).toBeVisible();
    await expect(page.getByRole("button", { name: /continuar com google/i })).toHaveCount(1);
    await expect(page.getByRole("link", { name: /termos de uso/i })).toHaveAttribute("href", "/termos");
    await expect(page.getByRole("link", { name: /política de privacidade/i })).toHaveAttribute("href", "/privacidade");
  });

  test("rota protegida sem login redireciona para /auth", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/biblioteca");
    await page.waitForURL(/\/auth/, { timeout: 10_000 });
    expect(page.url()).toContain("/auth");
  });

  test("termos e privacidade são públicos", async ({ page }) => {
    await page.goto("/termos");
    await expect(page.getByRole("heading", { name: /termos de uso/i })).toBeVisible();

    await page.goto("/privacidade");
    await expect(page.getByRole("heading", { name: /política de privacidade/i })).toBeVisible();
  });

  test("login com email/senha leva para home", async ({ page }) => {
    test.skip(!HAS_AUTH_CREDS, "E2E_TEST_EMAIL/PASSWORD não configurados");

    await page.goto("/auth");
    await page.getByRole("button", { name: /entrar com e-?mail/i }).click();
    await page.getByLabel(/e-?mail/i).fill(EMAIL);
    await page.getByLabel(/senha/i).fill(PASSWORD);
    await page.getByRole("button", { name: /^entrar$/i }).click();

    await page.waitForURL(/\/(?:|index|onboarding)/, { timeout: 15_000 });
    expect(page.url()).not.toContain("/auth");
  });
});
