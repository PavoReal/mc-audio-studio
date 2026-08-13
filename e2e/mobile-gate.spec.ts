import { expect, test } from "@playwright/test";

test("shows the desktop gate on mobile devices", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome", "mobile emulation only");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /come back on desktop/i })).toBeVisible();
  await expect(page.locator(".start-column")).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("does not show the gate on desktop", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "desktop only");
  await page.goto("/");
  await expect(page.locator(".start-column")).toBeVisible();
  await expect(page.locator(".mobile-gate")).toHaveCount(0);
});
