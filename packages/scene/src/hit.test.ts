import { expect, test } from "vitest";
import { topmostAt } from "./index";

const item = (key: string, z: string, x: number, rotation = 0) => ({
  key,
  z,
  x,
  y: 0,
  width: 200,
  height: 100,
  rotation,
});

test("a point inside an item hits it, and a point outside hits nothing", () => {
  const items = [item("a", "a0", 0)];

  expect(topmostAt(items, { x: 99, y: 49 })?.key).toBe("a");
  expect(topmostAt(items, { x: 101, y: 0 })).toBeUndefined();
});

test("where items overlap, the one with the higher z wins, whatever the list order", () => {
  const items = [item("top", "a2", 50), item("bottom", "a1", 0)];

  expect(topmostAt(items, { x: 60, y: 0 })?.key).toBe("top");
  expect(topmostAt([...items].reverse(), { x: 60, y: 0 })?.key).toBe("top");
  expect(topmostAt(items, { x: -90, y: 0 })?.key).toBe("bottom");
});

test("a rotated item is hit inside its rotated rectangle, not its unrotated one", () => {
  const items = [item("turned", "a0", 0, Math.PI / 2)];

  expect(topmostAt(items, { x: 0, y: 90 })?.key).toBe("turned");
  expect(topmostAt(items, { x: 90, y: 0 })).toBeUndefined();
});
