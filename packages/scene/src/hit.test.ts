import { expect, test } from "vitest";
import { topmostAt, touching } from "./index";

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

const keysTouching = (
  items: ReturnType<typeof item>[],
  from: { x: number; y: number },
  to: { x: number; y: number },
) => touching(items, from, to).map(({ key }) => key);

test("a rectangle selects the items it holds or overlaps, and not the ones outside it", () => {
  const items = [item("a", "a0", 0), item("b", "a1", 500), item("c", "a2", 1000)];

  expect(keysTouching(items, { x: -150, y: -80 }, { x: 150, y: 80 })).toEqual(["a"]);
  expect(keysTouching(items, { x: 50, y: -10 }, { x: 450, y: 10 })).toEqual(["a", "b"]);
  expect(keysTouching(items, { x: 101, y: -10 }, { x: 399, y: 10 })).toEqual([]);
  expect(keysTouching(items, { x: -50, y: 60 }, { x: 50, y: 200 })).toEqual([]);
});

test("a rectangle that only meets an item's edge touches it", () => {
  const items = [item("a", "a0", 0)];

  expect(keysTouching(items, { x: 100, y: -10 }, { x: 200, y: 10 })).toEqual(["a"]);
  expect(keysTouching(items, { x: -10, y: 50 }, { x: 10, y: 90 })).toEqual(["a"]);
});

test("a turned item is touched by its own rectangle, not by the upright box around it", () => {
  // 200 by 100 turned 45 degrees: its upright box reaches 106 from the center on each axis.
  const items = [item("turned", "a0", 0, Math.PI / 4)];

  expect(keysTouching(items, { x: 85, y: 85 }, { x: 105, y: 105 })).toEqual([]);
  expect(keysTouching(items, { x: 60, y: 60 }, { x: 105, y: 105 })).toEqual(["turned"]);
});

test("a rectangle dragged up and to the left selects the same items as one dragged down and to the right", () => {
  const items = [item("a", "a0", 0), item("b", "a1", 500)];

  expect(keysTouching(items, { x: 450, y: 10 }, { x: 50, y: -10 })).toEqual(["a", "b"]);
  expect(keysTouching(items, { x: 150, y: 80 }, { x: -150, y: -80 })).toEqual(["a"]);
});
