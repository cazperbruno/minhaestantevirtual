import { expect, test } from "@playwright/test";

for (const route of ["/auth", "/termos", "/privacidade"] as const) {
  test(`boot público ${route}`, async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const badResponses: string[] = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => {
      failedRequests.push(
        `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`,
      );
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        badResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${route} returned an unhealthy HTTP status`).toBeLessThan(400);

    const root = page.locator("#root");
    const mounted = await expect(root).not.toBeEmpty({ timeout: 8_000 }).then(
      () => true,
      () => false,
    );

    if (!mounted) {
      throw new Error(
        [
          `${route} did not mount the React root`,
          pageErrors.length ? `pageerror:\n${pageErrors.join("\n")}` : "pageerror: none captured",
          consoleErrors.length ? `console.error:\n${consoleErrors.join("\n")}` : "console.error: none captured",
          failedRequests.length ? `requestfailed:\n${failedRequests.join("\n")}` : "requestfailed: none captured",
          badResponses.length ? `HTTP >=400:\n${badResponses.join("\n")}` : "HTTP >=400: none captured",
        ].join("\n\n"),
      );
    }

    await expect(page.locator("body"), `${route} did not render Readify content`).toContainText(
      /readify/i,
      { timeout: 8_000 },
    );

    expect(pageErrors, `fatal page errors on ${route}:\n${pageErrors.join("\n")}`).toEqual([]);

    if (consoleErrors.length) {
      console.log(`[boot:${route}] console errors:\n${consoleErrors.join("\n")}`);
    }
  });
}
