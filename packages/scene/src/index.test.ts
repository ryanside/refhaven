import { expect, test } from "vitest";
import { screenToWorld, worldToScreen } from "./index";

test("a world point maps to the screen through the camera and back", () => {
  const camera = { x: 100, y: -50, zoom: 2 };

  expect(worldToScreen(camera, { x: 110, y: -40 })).toEqual({ x: 20, y: 20 });
  expect(screenToWorld(camera, { x: 20, y: 20 })).toEqual({ x: 110, y: -40 });
});
