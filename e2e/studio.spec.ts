import { expect, test, type Page } from "@playwright/test";

async function createPack(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /create new sound pack/i })).toBeVisible();
  await page.getByRole("button", { name: /^create$/i }).click();
}

test("shows the create screen on a fresh profile and opens the three-panel studio", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /create new sound pack/i })).toBeVisible();
  await expect(page.getByText(/local only/i)).toBeVisible();
  await expect(page.getByLabel(/pack name/i)).toHaveValue("My Sound Pack");
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByRole("heading", { name: /find a moment/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /sound details/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /export pack/i })).toBeVisible();
});

test("lists saved packs in the save selector and deletes with confirmation", async ({ page }) => {
  await createPack(page);
  await expect(page.getByRole("heading", { name: /find a moment/i })).toBeVisible();
  await page.getByRole("button", { name: /back to projects/i }).click();
  await expect(page.getByRole("heading", { name: /select sound pack/i })).toBeVisible();
  const row = page.locator(".save-row", { hasText: "My Sound Pack" });
  await expect(row).toContainText(/format \d/);
  await expect(row).toContainText(/0 edited/);

  await page.getByRole("button", { name: /create new pack/i }).click();
  await expect(page.getByRole("heading", { name: /create new sound pack/i })).toBeVisible();
  await page.getByRole("button", { name: /back/i }).click();
  await expect(page.getByRole("heading", { name: /select sound pack/i })).toBeVisible();

  await row.getByRole("button", { name: /delete my sound pack/i }).click();
  await expect(row).toContainText(/delete pack and its audio\?/i);
  await row.getByRole("button", { name: /^no$/i }).click();
  await expect(row).not.toContainText(/delete pack and its audio\?/i);
  await row.getByRole("button", { name: /delete my sound pack/i }).click();
  await row.getByRole("button", { name: /^yes$/i }).click();
  await expect(page.getByRole("heading", { name: /create new sound pack/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /back/i })).toHaveCount(0);
});

test("creates a pack with a custom name", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/pack name/i).fill("Cave Noises");
  await page.getByRole("button", { name: /^create$/i }).click();
  const scene = page.locator("main.workspace");
  await expect(scene).toHaveClass(/scene-day/);
  await expect(page.locator(".pack-title input")).toHaveValue("Cave Noises");
});

test("keeps the category filters readable instead of flex-shrinking them", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createPack(page);
  const strip = page.getByLabel("Sound categories");
  const firstFilters = strip.getByRole("button").filter({ visible: true });
  await expect(strip).toBeVisible();
  await expect(strip.getByRole("button", { name: "all", exact: true })).toBeVisible();
  await expect(strip.getByRole("button", { name: "ambient", exact: true })).toBeVisible();
  const dimensions = await strip.evaluate((element) => {
    const first = element.querySelector("button");
    return {
      stripHeight: element.getBoundingClientRect().height,
      buttonHeight: first?.getBoundingClientRect().height ?? 0,
      fontSize: first ? Number.parseFloat(getComputedStyle(first).fontSize) : 0
    };
  });
  expect(dimensions).toEqual({ stripHeight: 38, buttonHeight: 26, fontSize: 10 });
  expect(await firstFilters.count()).toBeGreaterThanOrEqual(5);
});

test("encodes Minecraft-compatible Ogg Vorbis in the dedicated worker", async ({ page }) => {
  await page.goto("/");
  const encoded = await page.evaluate(async () => {
    const sampleRate = 48_000;
    const samples = new Float32Array(sampleRate / 4);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.sin(index / sampleRate * 440 * Math.PI * 2) * 0.2;
    }
    const worker = new Worker("/ogg-encoder.worker.js");
    const blob = await new Promise<Blob>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("encoder timeout")), 20_000);
      worker.onmessage = (event: MessageEvent<{ ok: boolean; blob?: Blob; error?: string }>) => {
        window.clearTimeout(timeout);
        event.data.ok && event.data.blob ? resolve(event.data.blob) : reject(new Error(event.data.error));
      };
      worker.onerror = (event) => reject(new Error(event.message));
      worker.postMessage({ id: "encoder-smoke", channels: [samples], sampleRate }, [samples.buffer]);
    });
    worker.terminate();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder("latin1").decode(bytes);
    return { size: bytes.length, ogg: text.startsWith("OggS"), vorbis: text.includes("vorbis") };
  });
  expect(encoded).toMatchObject({ ogg: true, vorbis: true });
  expect(encoded.size).toBeGreaterThan(100);
});

test("collapses the inspector into a drawer below 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1279, height: 800 });
  await createPack(page);
  await page.locator('button[title="Open inspector"]').click();
  await expect(page.locator(".inspector-panel")).toHaveClass(/open/);
  await expect(page.getByRole("button", { name: /close inspector drawer/i })).toBeVisible();
});

test("recovers visibly when microphone permission is denied", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Permission denied", "NotAllowedError"); };
  });
  await createPack(page);
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByRole("alert")).toContainText(/microphone access was denied/i);
  await expect(page.getByRole("button", { name: "Record" })).toBeEnabled();
});

test("records a fake mono microphone take and autosaves it", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  await createPack(page);
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Replacement ready")).toBeVisible();
  await expect(page.getByRole("button", { name: /microphone take/i })).toBeVisible();
  await expect(page.getByText(/project autosaved in this browser/i)).toBeVisible();
  await expect(page.locator(".wave-canvas")).toHaveCount(1);
  await expect(page.locator(".wave-trim-handle")).toHaveCount(2);
  // The canvas should have painted waveform pixels distinct from the flat track background.
  const painted = await page.locator(".wave-canvas").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width) return 0;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hits = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 2]! > data[index]! + 30) hits += 1; // blue-dominant waveform pixels
    }
    return hits;
  });
  expect(painted).toBeGreaterThan(100);
  await expect(page.locator(".amp-ruler")).toContainText("1.0");
  await expect(page.locator(".amp-ruler")).toContainText("-1.0");
  await expect(page.locator(".time-ruler canvas")).toHaveCount(1);
});

test("drag on the waveform sets the trim selection", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  await createPack(page);
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Replacement ready")).toBeVisible();
  const track = page.locator(".wave-track");
  const box = await track.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.25, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.75, box!.y + box!.height / 2, { steps: 8 });
  await page.mouse.up();
  const times = page.locator(".waveform-times span");
  await expect(times.first()).not.toHaveText("0:00.0");
});
