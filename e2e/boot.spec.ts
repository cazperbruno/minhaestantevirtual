import { expect, test } from "@playwright/test";

for (const route of ["/auth", "/termos", "/privacidade"] as const) {
  test(`boot público ${route}`, async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${route} returned an unhealthy HTTP status`).toBeLessThan(400);

    const root = page.locator("#root");
    await expect(root, `${route} did not mount the React root`).not.toBeEmpty({ timeout: 8_000 });
    await expect(page.locator("body"), `${route} did not render Readify content`).toContainText(
      /readify/i,
      { timeout: 8_000 },
    );

    expect(pageErrors, `fatal page errors on ${route}:\n${pageErrors.join("\n")}`).toEqual([]);

    // Console errors can include rejected third-party/network requests in CI.
    // Keep them visible in the trace/log without treating those as fatal boot errors.
    if (consoleErrors.length) {
      console.log(`[boot:${route}] console errors:\n${consoleErrors.join("\n")}`);
    }
  });
}
