import type { Point } from "./index";
import type { Size } from "./layout";

type Hittable = Point &
  Size & { readonly key: string; readonly rotation: number; readonly z: string };

/** Whether the item's rotated rectangle holds the world point. */
export function contains(item: Hittable, point: Point): boolean {
  const dx = point.x - item.x;
  const dy = point.y - item.y;
  const cos = Math.cos(item.rotation);
  const sin = Math.sin(item.rotation);
  return (
    Math.abs(dx * cos + dy * sin) <= item.width / 2 &&
    Math.abs(-dx * sin + dy * cos) <= item.height / 2
  );
}

const above = (a: Hittable, b: Hittable) => a.z > b.z || (a.z === b.z && a.key > b.key);

/** The topmost item whose rectangle holds the world point. */
export function topmostAt<Item extends Hittable>(
  items: Iterable<Item>,
  point: Point,
): Item | undefined {
  let top: Item | undefined;
  for (const item of items) {
    if (contains(item, point) && (!top || above(item, top))) top = item;
  }
  return top;
}
