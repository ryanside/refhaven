import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import type { Point } from "./index";

export type Size = { readonly width: number; readonly height: number };

export type Box = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

/** An item on the canvas: its pixel size, its center in world units, and its rotation in radians. */
export type Frame = Point & Size & { readonly scale: number; readonly rotation: number };

export type Placement = Point & { readonly scale: number };

/** A placed item's longer edge, in world units. */
export const placedEdge = 400;

/** The space between placed items, and between them and the layout, in world units. */
export const placementGap = 40;

/** The scale that gives an item of this pixel size its longer edge at `placedEdge`. */
export const placedScale = ({ width, height }: Size) => placedEdge / Math.max(width, height);

export function boundsOf(frames: Iterable<Frame>): Box | null {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { x, y, width, height, scale, rotation } of frames) {
    const cos = Math.abs(Math.cos(rotation));
    const sin = Math.abs(Math.sin(rotation));
    const halfWidth = ((width * cos + height * sin) * scale) / 2;
    const halfHeight = ((width * sin + height * cos) * scale) / 2;
    left = Math.min(left, x - halfWidth);
    top = Math.min(top, y - halfHeight);
    right = Math.max(right, x + halfWidth);
    bottom = Math.max(bottom, y + halfHeight);
  }
  return left === Infinity ? null : { left, top, right, bottom };
}

/**
 * Places new items in rows to the right of the layout, top-aligned with it, so that they overlap
 * neither the layout nor each other. Each item is scaled so its longer edge is `placedEdge`.
 */
export function placeBeside<Item extends Size>(
  layout: Box | null,
  items: ReadonlyArray<Item>,
): Array<Item & Placement> {
  const perRow = Math.ceil(Math.sqrt(items.length));
  const left = layout ? layout.right + placementGap : 0;
  let top = layout?.top ?? 0;
  const placed: Array<Item & Placement> = [];
  for (let start = 0; start < items.length; start += perRow) {
    const row = items.slice(start, start + perRow).map((item) => {
      const scale = placedScale(item);
      return { item, scale, width: item.width * scale, height: item.height * scale };
    });
    let x = left;
    for (const { item, scale, width, height } of row) {
      placed.push({ ...item, x: x + width / 2, y: top + height / 2, scale });
      x += width + placementGap;
    }
    top += Math.max(...row.map(({ height }) => height)) + placementGap;
  }
  return placed;
}

/** Returns `count` z keys, in order, that sort above every key in `existing`. */
export function zAbove(existing: Iterable<string>, count: number): Array<string> {
  let top: string | null = null;
  for (const z of existing) {
    if (top === null || z > top) top = z;
  }
  return generateNKeysBetween(top, null, count);
}

/** Returns `count` z keys, in order, that sort below every key in `existing`. */
export function zBelow(existing: Iterable<string>, count: number): Array<string> {
  let bottom: string | null = null;
  for (const z of existing) {
    if (bottom === null || z < bottom) bottom = z;
  }
  return generateNKeysBetween(null, bottom, count);
}

const zAlphabet = /^[0-9A-Za-z]+$/;

/** Whether `z` is a key that `zAbove` can sort above. A character outside base 62 would sort above every key it makes. */
export function isZ(z: string): boolean {
  if (!zAlphabet.test(z)) return false;
  try {
    generateKeyBetween(z, null);
    return true;
  } catch {
    return false;
  }
}
