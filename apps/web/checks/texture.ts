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
  await page.goto(`${appUrl}/lab/texture`);

  const png = await page.evaluate((fill) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.fillStyle = fill;
    context.fillRect(0, 0, 256, 256);
    return canvas.toDataURL("image/png").split(",")[1]!;
  }, color);
  await page.getByLabel("Image").setInputFiles({
    name: "check.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page.getByRole("button", { name: "Upload" }).click();

  const drawn = page.getByTestId("drawn");
  await page.waitForFunction(() => {
    const status = document.querySelector('[data-testid="drawn"]')?.getAttribute("data-status");
    return (
      status === "failed" ||
      (status === "drawn" &&
        document.querySelector('[data-testid="drawn"]')?.getAttribute("data-textures") === "1")
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
