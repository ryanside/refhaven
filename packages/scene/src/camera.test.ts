import { expect, test } from "vitest";
import {
  fitCamera,
  imageRole,
  itemsInView,
  maxZoom,
  minZoom,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from "./index";

test("zooming toward a screen point keeps the world point under it", () => {
  const camera = { x: 120, y: -40, zoom: 0.8 };
  const cursor = { x: 300, y: 200 };
  const before = screenToWorld(camera, cursor);

  const zoomed = zoomAt(camera, cursor, 2.5);

  expect(zoomed.zoom).toBe(2.5);
  const after = screenToWorld(zoomed, cursor);
  expect(after.x).toBeCloseTo(before.x);
  expect(after.y).toBeCloseTo(before.y);
});

test("zoom stops at 1% and 6400%, and the point under the cursor still holds", () => {
  const camera = { x: 0, y: 0, zoom: 1 };
  const cursor = { x: 50, y: 70 };

  const out = zoomAt(camera, cursor, 0.0001);
  const inward = zoomAt(camera, cursor, 1000);

  expect([out.zoom, inward.zoom]).toEqual([minZoom, maxZoom]);
  expect([minZoom, maxZoom]).toEqual([0.01, 64]);
  for (const zoomed of [out, inward]) {
    expect(worldToScreen(zoomed, screenToWorld(camera, cursor)).x).toBeCloseTo(cursor.x);
  }
});

test("panning by a screen distance moves the camera by that distance in world units", () => {
  expect(panBy({ x: 10, y: 10, zoom: 2 }, { x: 100, y: -40 })).toEqual({ x: 60, y: -10, zoom: 2 });
});

test("the first camera shows every item at no more than 100%", () => {
  const items = [
    { x: 0, y: 0, width: 200, height: 100, rotation: 0 },
    { x: 1000, y: 500, width: 200, height: 100, rotation: 0 },
  ];
  const camera = fitCamera({ width: 800, height: 600 }, items);

  for (const item of items) {
    const screen = worldToScreen(camera, item);
    expect(screen.x).toBeGreaterThan(0);
    expect(screen.x).toBeLessThan(800);
    expect(screen.y).toBeGreaterThan(0);
    expect(screen.y).toBeLessThan(600);
  }
  expect(camera.zoom).toBeLessThan(1);
  expect(fitCamera({ width: 800, height: 600 }, [items[0]!]).zoom).toBe(1);
});

test("only items in or near the viewport are in view", () => {
  const camera = { x: 0, y: 0, zoom: 1 };
  const at = (key: string, x: number) => ({ key, x, y: 50, width: 100, height: 100, rotation: 0 });
  const items = [at("inside", 100), at("near", 860), at("far", 2000)];

  expect(itemsInView(items, camera, { width: 800, height: 600 }, 0).map(({ key }) => key)).toEqual([
    "inside",
  ]);
  expect(
    itemsInView(items, camera, { width: 800, height: 600 }, 200).map(({ key }) => key),
  ).toEqual(["inside", "near"]);
});

test("an item needs its display copy once its longer edge on screen passes 512 device pixels", () => {
  const item = { width: 400, height: 250 };

  expect(imageRole(item, 1)).toBe("thumbnail");
  expect(imageRole(item, 512 / 400)).toBe("thumbnail");
  expect(imageRole(item, 1.3)).toBe("display");
  expect(imageRole(item, 0.05)).toBe("thumbnail");
});
