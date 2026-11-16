import { appUrl, assert, openPageWithPasskeyDevice, signInWithPasskey } from "./browser";

const color = "rgb(220, 40, 120)";

const { browser, page } = await openPageWithPasskeyDevice();
const consoleErrors: string[] = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
const imageResponses: Array<{ url: string; status: number; allowOrigin: string | undefined }> = [];
page.on("response", (response) => {
  if (response.url().includes(".r2.cloudflarestorage.com")) {
    imageResponses.push({
      url: response
        .url()
        .split("?")[0]!
        .replace(/^https:\/\/[^/]+/, "https://<r2 endpoint>"),
      status: response.status(),
      allowOrigin: response.headers()["access-control-allow-origin"],
    });
  }
});

try {
  await signInWithPasskey(page, `check-${Date.now().toString(36)}`);

  const pngOf = (fill: string, width: number, height: number) =>
    page.evaluate(
      ({ fill, width, height }) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d")!;
        context.fillStyle = fill;
        context.fillRect(0, 0, width, height);
        return canvas.toDataURL("image/png").split(",")[1]!;
      },
      { fill, width, height },
    );
  for (const [name, png] of [
    ["large.png", await pngOf("rgb(30, 30, 200)", 3000, 2000)],
    ["check.png", await pngOf(color, 256, 256)],
  ] as const) {
    await page.getByLabel("Add images").setInputFiles({
      name,
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
    await page.locator(`[role="status"] li[data-outcome="saved"]`).getByText(name).waitFor();
  }
  imageResponses.length = 0;
  await page.goto(`${appUrl}/lab/texture`);

  const drawn = page.getByTestId("drawn");
  await page.waitForFunction(() => {
    const status = document.querySelector('[data-testid="drawn"]')?.getAttribute("data-status");
    return (
      status === "failed" ||
      (status === "drawn" &&
        document.querySelector('[data-testid="drawn"]')?.getAttribute("data-textures") === "2")
    );
  });
  assert(
    (await drawn.getAttribute("data-status")) === "drawn",
    `the uploaded image was fetched from R2 and drawn: ${await drawn.textContent()}`,
  );
  assert(
    (await drawn.getAttribute("data-first-item-pixel")) === color,
    `the WebGL canvas shows the image's color ${color} at the item's center`,
  );

  assert(
    imageResponses.some(({ url }) => url.endsWith("/2048.webp")) &&
      imageResponses.some(({ url }) => /\/o\/[0-9a-f]{64}$/.test(url)),
    "the lab draws the large image's 2048 px display copy and the small image's original",
  );

  const crossOrigin = consoleErrors.filter((text) => /cors|cross-origin/i.test(text));
  assert(
    crossOrigin.length === 0,
    `no cross-origin error in the console (${consoleErrors.length} console errors in total)`,
  );
  console.log(`R2 responses seen by the page: ${JSON.stringify(imageResponses, null, 2)}`);

  const signedUrl = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .findLast(
        (name) => name.includes(".r2.cloudflarestorage.com") && name.includes("X-Amz-Signature"),
      ),
  );
  const otherOrigin = await page.context().newPage();
  await otherOrigin.route("http://other-origin.test/", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html></html>" }),
  );
  await otherOrigin.goto("http://other-origin.test/");
  const fromOtherOrigin = await otherOrigin.evaluate(
    (url) =>
      fetch(url!).then(
        () => "allowed",
        (error: Error) => `blocked: ${error.message}`,
      ),
    signedUrl,
  );
  assert(
    fromOtherOrigin.startsWith("blocked"),
    `the same signed URL is refused from an origin the bucket's CORS policy does not list: ${fromOtherOrigin}`,
  );

  if (process.env.SCREENSHOT) {
    await page.screenshot({ path: process.env.SCREENSHOT });
  }
} finally {
  await browser.close();
}
