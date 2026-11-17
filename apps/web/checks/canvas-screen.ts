import { api } from "@refhaven/backend/api";
import { type Camera, type Point, screenToWorld, topmostAt, worldToScreen } from "@refhaven/scene";
import type { FunctionReturnType } from "convex/server";
import { PNG } from "pngjs";
import type { Page } from "playwright";

export type Item = FunctionReturnType<typeof api.canvas.open>["items"][number];

/** The Ref of an image item. A check that reads it puts only images where it reads. */
export const refOf = (item: Item) => {
  if (item.kind !== "image") throw new Error(`FAIL item ${item.key} is a note, not an image`);
  return item.refId;
};

const evidence = process.env.EVIDENCE;

export type Rgb = readonly [number, number, number];
export type Rect = { left: number; top: number; right: number; bottom: number };

export const until = async <T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  label: string,
) => {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`FAIL timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

export const solidPng = async (page: Page, color: Rgb, width: number, height: number) =>
  Buffer.from(
    await page.evaluate(
      ({ color, width, height }) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d")!;
        context.fillStyle = `rgb(${color.join(",")})`;
        context.fillRect(0, 0, width, height);
        return canvas.toDataURL("image/png").split(",")[1]!;
      },
      { color, width, height },
    ),
    "base64",
  );

export const readout = async (page: Page) => {
  const element = page.getByTestId("canvas-readout");
  const number = async (name: string) => Number(await element.getAttribute(`data-${name}`));
  return {
    items: await number("items"),
    selected: await number("selected"),
    camera: {
      x: await number("camera-x"),
      y: await number("camera-y"),
      zoom: (await number("zoom")) / 100,
    } satisfies Camera,
  };
};

export const host = async (page: Page) => (await page.getByTestId("canvas").boundingBox())!;

/** Waits until the frame after the latest input has drawn. */
export const settle = (page: Page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

export const waitForCanvas = async (page: Page, count: number) => {
  await page
    .locator(`[data-testid="canvas"][data-shown-thumbnails="${count}"]`)
    .waitFor({ timeout: 15_000 });
  await until(
    () => readout(page),
    (r) => r.items === count,
    `${count} items in the readout`,
  );
  await settle(page);
};

export const screenshot = async (page: Page, name?: string) => {
  const buffer = await page.screenshot(evidence && name ? { path: `${evidence}/${name}` } : {});
  return PNG.sync.read(buffer);
};

export const pixelAt = (png: PNG, point: Point): Rgb => {
  const offset = (Math.round(point.y) * png.width + Math.round(point.x)) * 4;
  return [png.data[offset]!, png.data[offset + 1]!, png.data[offset + 2]!];
};

export const near = (a: Rgb, b: Rgb) =>
  a.every((channel, index) => Math.abs(channel - b[index]!) <= 12);

/** The rectangle of the pixels near `color`, or null when none is. */
export const rectOf = (png: PNG, color: Rgb): Rect | null => {
  let rect: Rect | null = null;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (!near(pixelAt(png, { x, y }), color)) continue;
      rect = rect
        ? {
            left: Math.min(rect.left, x),
            top: Math.min(rect.top, y),
            right: Math.max(rect.right, x + 1),
            bottom: Math.max(rect.bottom, y + 1),
          }
        : { left: x, top: y, right: x + 1, bottom: y + 1 };
    }
  }
  return rect;
};

export const sameRect = (a: Rect | null, b: Rect, tolerance: number) =>
  a !== null &&
  (["left", "top", "right", "bottom"] as const).every(
    (side) => Math.abs(a[side] - b[side]) <= tolerance,
  );

export const showRect = (rect: Rect | null) =>
  rect
    ? `${Math.round(rect.left)},${Math.round(rect.top)} to ${Math.round(rect.right)},${Math.round(rect.bottom)}`
    : "none";

export const worldSize = (item: Item) => ({
  width: item.width * item.scale,
  height: item.height * item.scale,
});
export const sized = (items: ReadonlyArray<Item>) =>
  items.map((item) => ({ ...item, ...worldSize(item) }));

export const pageView = async (page: Page) => ({
  camera: (await readout(page)).camera,
  box: await host(page),
});
export type PageView = Awaited<ReturnType<typeof pageView>>;

export const toPage = ({ camera, box }: PageView, world: Point): Point => {
  const screen = worldToScreen(camera, world);
  return { x: box.x + screen.x, y: box.y + screen.y };
};

export const toWorld = ({ camera, box }: PageView, point: Point) =>
  screenToWorld(camera, { x: point.x - box.x, y: point.y - box.y });

export const rectOnPage = (view: PageView, item: Item): Rect => {
  const { width, height } = worldSize(item);
  const topLeft = toPage(view, { x: item.x - width / 2, y: item.y - height / 2 });
  return {
    left: topLeft.x,
    top: topLeft.y,
    right: topLeft.x + width * view.camera.zoom,
    bottom: topLeft.y + height * view.camera.zoom,
  };
};

/** A point of the item that no other item covers. */
export const exposedPoint = (item: Item, items: ReadonlyArray<Item>): Point => {
  const { width, height } = worldSize(item);
  for (const [fx, fy] of [
    [0, 0],
    [0.35, 0],
    [-0.35, 0],
    [0, 0.35],
    [0, -0.35],
  ] as const) {
    const point = { x: item.x + fx * width, y: item.y + fy * height };
    if (topmostAt(sized(items), point)?.key === item.key) return point;
  }
  throw new Error(`FAIL item ${item.key} has no exposed point to test`);
};
