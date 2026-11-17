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

/** Orders items from the bottom of the stack to the top. Items with the same z are ordered by key. */
export const stackOrder = (
  a: { readonly key: string; readonly z: string },
  b: { readonly key: string; readonly z: string },
) => (a.z < b.z ? -1 : a.z > b.z ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** The topmost item whose rectangle holds the world point. */
export function topmostAt<Item extends Hittable>(
  items: Iterable<Item>,
  point: Point,
): Item | undefined {
  let top: Item | undefined;
  for (const item of items) {
    if (contains(item, point) && (!top || stackOrder(item, top) > 0)) top = item;
  }
  return top;
}

/**
 * The items whose own rotated rectangle overlaps the upright rectangle between two world corners,
 * in either order. An item that only the upright box around it would overlap is left out.
 */
export function touching<Item extends Hittable>(
  items: Iterable<Item>,
  corner: Point,
  opposite: Point,
): Array<Item> {
  const x = (corner.x + opposite.x) / 2;
  const y = (corner.y + opposite.y) / 2;
  const halfWidth = Math.abs(corner.x - opposite.x) / 2;
  const halfHeight = Math.abs(corner.y - opposite.y) / 2;
  // Two rectangles overlap unless one of their four edge directions separates them.
  return [...items].filter((item) => {
    const dx = item.x - x;
    const dy = item.y - y;
    const cos = Math.cos(item.rotation);
    const sin = Math.sin(item.rotation);
    const [absCos, absSin] = [Math.abs(cos), Math.abs(sin)];
    return (
      Math.abs(dx) <= halfWidth + (item.width * absCos + item.height * absSin) / 2 &&
      Math.abs(dy) <= halfHeight + (item.width * absSin + item.height * absCos) / 2 &&
      Math.abs(dx * cos + dy * sin) <= item.width / 2 + halfWidth * absCos + halfHeight * absSin &&
      Math.abs(-dx * sin + dy * cos) <= item.height / 2 + halfWidth * absSin + halfHeight * absCos
    );
  });
}
