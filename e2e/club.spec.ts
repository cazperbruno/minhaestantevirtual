import { test, expect } from "@playwright/test";
import { loginWithEmail } from "./helpers/auth";

const EMAIL = process.env.E2E_TEST_EMAIL || "";
const PASSWORD = process.env.E2E_TEST_PASSWORD || "";

test.describe("Clubes", () => {
  test.skip(!EMAIL || !PASSWORD, "Credenciais E2E não configuradas");

  test("listar clubes públicos", async ({ page }) => {
    await loginWithEmail(page, EMAIL, PASSWORD);
    await page.goto("/clubes");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
