import path from "node:path";
import { chromium } from "playwright";
import { appUrl, assert } from "./browser";

const color = [220, 40, 120, 255];
const rendererModule = `/@fs${path.resolve(import.meta.dir, "../../../packages/renderer/src/pixi.ts")}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(appUrl);
  const pixels = await page.evaluate(
    async ({ rendererModule, color }) => {
      const { createPixiRenderer } = await import(rendererModule);
      const host = document.createElement("div");
      host.style.cssText = "width:400px;height:320px";
      document.body.appendChild(host);
      const renderer = await createPixiRenderer(host);

      const image = document.createElement("canvas");
      image.width = image.height = 256;
      const context = image.getContext("2d")!;
      context.fillStyle = `rgb(${color.slice(0, 3).join(",")})`;
      context.fillRect(0, 0, 256, 256);
      renderer.uploadTexture("local", await createImageBitmap(image));
      renderer.upsertItems([
        { key: "item", texture: "local", x: 160, y: 160, scale: 1, rotation: 0, z: "a0" },
      ]);

      const canvas = host.querySelector("canvas")!;
      const gl = canvas.getContext("webgl2")!;
      const pixelAt = (x: number, y: number) => {
        const ratio = canvas.width / canvas.clientWidth;
        const pixel = new Uint8Array(4);
        gl.readPixels(
          Math.round(x * ratio),
          canvas.height - Math.round(y * ratio),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel,
        );
        return [...pixel];
      };

      renderer.draw();
      const insideItem = pixelAt(160, 160);
      const outsideItem = pixelAt(380, 300);
      renderer.setCamera({ x: 100, y: 0, zoom: 1 });
      renderer.draw();
      const insideItemAfterPan = pixelAt(60, 160);
      return { insideItem, outsideItem, insideItemAfterPan, api: gl.getParameter(gl.VERSION) };
    },
    { rendererModule, color },
  );

  const same = (a: number[], b: number[]) => a.join() === b.join();
  assert(
    same(pixels.insideItem, color),
    `a bitmap uploaded as a texture is drawn with its color on ${pixels.api}: ${pixels.insideItem}`,
  );
  assert(same(pixels.outsideItem, [0, 0, 0, 0]), "the canvas is transparent outside the item");
  assert(
    same(pixels.insideItemAfterPan, color),
    "the item moves 100 px left when the camera moves 100 world units right",
  );
} finally {
  await browser.close();
}
