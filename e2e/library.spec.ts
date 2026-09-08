import { test, expect } from "@playwright/test";
import { loginWithEmail } from "./helpers/auth";

const EMAIL = process.env.E2E_TEST_EMAIL || "";
const PASSWORD = process.env.E2E_TEST_PASSWORD || "";

test.describe("Biblioteca", () => {
  test.skip(!EMAIL || !PASSWORD, "Credenciais E2E não configuradas");

  test("abrir biblioteca e listar prateleiras", async ({ page }) => {
    await loginWithEmail(page, EMAIL, PASSWORD);
    await page.goto("/biblioteca");
    // Cabeçalho de página
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 });
  });

  test("buscar livro pela barra de busca global", async ({ page }) => {
    await loginWithEmail(page, EMAIL, PASSWORD);
    await page.goto("/buscar");
    const search = page.getByRole("searchbox").or(page.getByPlaceholder(/buscar/i));
    await search.first().fill("harry potter");
    // Esperar pelo menos 1 resultado renderizado
    await expect(page.getByText(/harry potter/i).first()).toBeVisible({ timeout: 8_000 });
  });
});
