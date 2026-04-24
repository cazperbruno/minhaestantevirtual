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

test.describe("Biblioteca", () => {
  test.skip(!EMAIL || !PASSWORD, "Credenciais E2E não configuradas");

  test("abrir biblioteca e listar prateleiras", async ({ page }) => {
    await login(page);
    await page.goto("/biblioteca");
    // Cabeçalho de página
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 });
  });

  test("buscar livro pela barra de busca global", async ({ page }) => {
    await login(page);
    await page.goto("/buscar");
    const search = page.getByRole("searchbox").or(page.getByPlaceholder(/buscar/i));
    await search.first().fill("harry potter");
    // Esperar pelo menos 1 resultado renderizado
    await expect(page.getByText(/harry potter/i).first()).toBeVisible({ timeout: 8_000 });
  });
});
