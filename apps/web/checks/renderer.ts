import path from "node:path";
import { chromium } from "playwright";
import { appUrl, assert } from "./browser";

const color = [220, 40, 120, 255];
const smallColor = [30, 160, 90, 255];
const rendererModule = `/@fs${path.resolve(import.meta.dir, "../../../packages/renderer/src/pixi.ts")}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(appUrl);
  const pixels = await page.evaluate(
    async ({ rendererModule, color, smallColor }) => {
      const { createPixiRenderer } = await import(rendererModule);
      const host = document.createElement("div");
      host.style.cssText = "width:400px;height:320px";
      document.body.appendChild(host);
      const renderer = await createPixiRenderer(host);

      const bitmapOf = async (rgba: number[], size: number) => {
        const image = document.createElement("canvas");
        image.width = image.height = size;
        const context = image.getContext("2d")!;
        context.fillStyle = `rgb(${rgba.slice(0, 3).join(",")})`;
        context.fillRect(0, 0, size, size);
        return createImageBitmap(image);
      };
      renderer.uploadTexture("local", await bitmapOf(color, 256));
      renderer.upsertItems([
        {
          key: "item",
          texture: "local",
          x: 160,
          y: 160,
          width: 200,
          height: 100,
          rotation: 0,
          z: "a0",
        },
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

      const edges = () => ({
        insideRight: pixelAt(255, 160),
        outsideRight: pixelAt(265, 160),
        insideBottom: pixelAt(160, 205),
        outsideBottom: pixelAt(160, 215),
      });

      renderer.draw();
      const insideItem = pixelAt(160, 160);
      const outsideItem = pixelAt(380, 300);
      const sizedByItem = edges();
      renderer.uploadTexture("local", await bitmapOf(smallColor, 32));
      renderer.draw();
      const afterSmallTexture = { center: pixelAt(160, 160), ...edges() };
      renderer.setCamera({ x: 100, y: 0, zoom: 1 });
      renderer.draw();
      const insideItemAfterPan = pixelAt(60, 160);
      const shown = await bitmapOf(color, 64);
      const spare = await bitmapOf(smallColor, 64);
      renderer.uploadTexture("local", shown);
      renderer.uploadTexture("spare", spare);
      renderer.draw();
      const widthsBeforeDestroy = [shown.width, spare.width];
      renderer.destroy();
      const widthsAfterDestroy = [shown.width, spare.width];
      return {
        widthsBeforeDestroy,
        widthsAfterDestroy,
        canvasesLeft: host.querySelectorAll("canvas").length,
        insideItem,
        outsideItem,
        sizedByItem,
        afterSmallTexture,
        insideItemAfterPan,
        api: gl.getParameter(gl.VERSION),
      };
    },
    { rendererModule, color, smallColor },
  );

  const same = (a: number[], b: number[]) => a.join() === b.join();
  const clear = [0, 0, 0, 0];
  assert(
    same(pixels.insideItem, color),
    `a bitmap uploaded as a texture is drawn with its color on ${pixels.api}: ${pixels.insideItem}`,
  );
  assert(same(pixels.outsideItem, clear), "the canvas is transparent outside the item");
  const coversItemSize = (
    edges: Record<"insideRight" | "outsideRight" | "insideBottom" | "outsideBottom", number[]>,
    fill: number[],
  ) =>
    same(edges.insideRight, fill) &&
    same(edges.outsideRight, clear) &&
    same(edges.insideBottom, fill) &&
    same(edges.outsideBottom, clear);
  assert(
    coversItemSize(pixels.sizedByItem, color),
    "a 256 px texture on a 200 by 100 item covers 200 by 100 screen pixels at 100%",
  );
  assert(
    same(pixels.afterSmallTexture.center, smallColor) &&
      coversItemSize(pixels.afterSmallTexture, smallColor),
    "a 32 px texture uploaded under the same key covers the same 200 by 100 pixels",
  );
  assert(
    same(pixels.insideItemAfterPan, smallColor),
    "the item moves 100 px left when the camera moves 100 world units right",
  );
  assert(
    same(pixels.widthsBeforeDestroy, [64, 64]) &&
      same(pixels.widthsAfterDestroy, [0, 0]) &&
      pixels.canvasesLeft === 0,
    `destroy closes every uploaded bitmap, also one no item shows, and removes the canvas: widths ${pixels.widthsBeforeDestroy} then ${pixels.widthsAfterDestroy}`,
  );
} finally {
  await browser.close();
}
