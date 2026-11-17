import { expect, test } from "vitest";
import {
  type Box,
  type Placement,
  type Size,
  boundsOf,
  isZ,
  placeBeside,
  placedEdge,
  placementGap,
  zAbove,
} from "./index";

const boxOf = (placed: Size & Placement) => boundsOf([{ ...placed, rotation: 0 }])!;

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const sizes: Array<Size> = [
  { width: 3000, height: 2000 },
  { width: 300, height: 300 },
  { width: 500, height: 1500 },
  { width: 1, height: 40 },
  { width: 800, height: 600 },
];

test("new items sit to the right of the layout, a gap away, and overlap nothing", () => {
  const layout = { left: -500, top: 100, right: 700, bottom: 2000 };
  const boxes = placeBeside(layout, sizes).map(boxOf);

  expect(boxes).toHaveLength(sizes.length);
  expect(Math.min(...boxes.map((box) => box.left))).toBeCloseTo(layout.right + placementGap);
  expect(Math.min(...boxes.map((box) => box.top))).toBeCloseTo(layout.top);
  for (const [index, box] of boxes.entries()) {
    expect(overlaps(box, layout)).toBe(false);
    for (const other of boxes.slice(index + 1)) {
      const apart = Math.max(
        other.left - box.right,
        box.left - other.right,
        other.top - box.bottom,
        box.top - other.bottom,
      );
      expect(apart).toBeGreaterThanOrEqual(placementGap - 1e-9);
    }
  }
});

test("a new item's longer edge is the default size, whatever its pixel size", () => {
  for (const box of placeBeside(null, sizes).map(boxOf)) {
    expect(Math.max(box.right - box.left, box.bottom - box.top)).toBeCloseTo(placedEdge);
  }
});

test("the layout's bounds include an item's rotation, so a placed item clears a rotated one", () => {
  const rotated = { x: 0, y: 0, width: 1000, height: 100, scale: 1, rotation: Math.PI / 2 };
  const layout = boundsOf([rotated])!;

  expect(layout.left).toBeCloseTo(-50);
  expect(layout.right).toBeCloseTo(50);
  expect(layout.top).toBeCloseTo(-500);
  expect(layout.bottom).toBeCloseTo(500);
  const [placed] = placeBeside(layout, [{ width: 100, height: 100 }]);
  expect(boxOf(placed!).left).toBeCloseTo(50 + placementGap);
});

test("an empty canvas has no bounds, and its items start at the origin", () => {
  expect(boundsOf([])).toBeNull();
  const [placed] = placeBeside(null, [{ width: 200, height: 100 }]);
  expect(boxOf(placed!)).toMatchObject({ left: 0, top: 0 });
});

test("new z keys sort above the old top, in order", () => {
  const existing = ["a0", "a5", "Zz", "a1V"];
  const added = zAbove(existing, 3);

  expect(added).toHaveLength(3);
  expect([...existing, ...added].sort().slice(-3)).toEqual(added);
  expect(added.every(isZ)).toBe(true);
});

test("a z that no key can sort above is not a z", () => {
  expect(["", "a", "hello", "a10", "a0V0", "a~", "a-", "a 1"].filter(isZ)).toEqual([]);
});
