import type { Page } from "@playwright/test";

export async function loginWithEmail(page: Page, email: string, password: string) {
  await page.goto("/auth");

  const emailInput = page.getByLabel(/e-?mail/i).first();
  if (!(await emailInput.isVisible().catch(() => false))) {
    const emailToggle = page.getByRole("button", { name: /entrar com e-?mail/i });
    if (await emailToggle.count()) await emailToggle.click();
  }

  await emailInput.fill(email);
  await page.getByLabel(/senha/i).first().fill(password);
  await page.getByRole("button", { name: /^entrar$/i }).click();
  await page.waitForURL(/\/(?:|index|onboarding)/, { timeout: 15_000 });
}
