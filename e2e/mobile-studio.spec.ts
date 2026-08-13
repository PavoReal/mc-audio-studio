import { expect, test, type Page } from "@playwright/test";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome", "mobile emulation only");
});

async function createPack(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /create new sound pack/i })).toBeVisible();
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.locator(".mobile-tabbar")).toBeVisible();
}

test("opens the studio on mobile without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /create new sound pack/i })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("starts on the recording tab and switches sections with the tab bar", async ({ page }) => {
  await createPack(page);
  await expect(page.getByRole("button", { name: "Record", exact: true })).toBeVisible();
  await expect(page.locator(".library-panel")).toHaveCount(0);

  await page.getByRole("navigation", { name: /studio sections/i }).getByRole("button", { name: /sounds/i }).click();
  await expect(page.locator(".library-panel")).toBeVisible();
  await page.locator(".sound-row").first().click();
  await expect(page.getByRole("button", { name: "Record", exact: true })).toBeVisible();

  await page.getByRole("navigation", { name: /studio sections/i }).getByRole("button", { name: /details/i }).click();
  await expect(page.getByRole("heading", { name: /sound details/i })).toBeVisible();
});

test("records a microphone take on mobile", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  await createPack(page);
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("navigation", { name: /studio sections/i }).getByRole("button", { name: /details/i }).click();
  await expect(page.getByText("Replacement ready")).toBeVisible();
});

test("shares the exported pack through the Web Share API", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  await page.addInitScript(() => {
    const shared: { title?: string; files?: { name: string; type: string; size: number }[] }[] = [];
    (window as unknown as { __shared: typeof shared }).__shared = shared;
    navigator.canShare = () => true;
    navigator.share = async (data?: ShareData) => {
      shared.push({
        title: data?.title,
        files: data?.files?.map((file) => ({ name: file.name, type: file.type, size: file.size }))
      });
    };
  });
  await createPack(page);
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("navigation", { name: /studio sections/i }).getByRole("button", { name: /details/i }).click();
  await expect(page.getByText("Replacement ready")).toBeVisible();

  await page.getByRole("button", { name: /share pack/i }).click();
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared.length), { timeout: 20_000 }).toBe(1);
  const payload = await page.evaluate(() => (window as unknown as { __shared: { title?: string; files?: { name: string; type: string; size: number }[] }[] }).__shared[0]);
  expect(payload?.files?.[0]?.name).toMatch(/\.zip$/);
  expect(payload?.files?.[0]?.type).toBe("application/zip");
  expect(payload?.files?.[0]?.size).toBeGreaterThan(100);
});
