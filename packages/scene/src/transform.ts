import type { Point } from "./index";
import { type Size, boundsOf } from "./layout";

/** The fields of an item that a gesture changes. */
export type Pose = Point & { readonly scale: number; readonly rotation: number };

/** A rectangle in world units, centered on `x` and `y` and turned by `rotation` radians. */
export type Rect = Point & Size & { readonly rotation: number };

/** Where each resize handle sits on its frame, in half its width and half its height from the center. */
export const handles = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
} as const satisfies Record<string, Point>;

export type Handle = keyof typeof handles;

/** The shortest a resized selection's longer edge gets, in screen pixels. */
export const minFrameEdge = 8;

/** Rotate snaps to steps of this many radians, 15 degrees, while Shift is held. */
export const snapStep = Math.PI / 12;

const turn = (point: Point, angle: number): Point => ({
  x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
  y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
});

/** One item's own rectangle, or the upright box around several. */
export function frameOf(items: ReadonlyArray<Rect>): Rect | null {
  if (items.length === 1) {
    const { x, y, width, height, rotation } = items[0]!;
    return { x, y, width, height, rotation };
  }
  const box = boundsOf(items.map((item) => ({ ...item, scale: 1 })));
  if (!box) return null;
  return {
    x: (box.left + box.right) / 2,
    y: (box.top + box.bottom) / 2,
    width: box.right - box.left,
    height: box.bottom - box.top,
    rotation: 0,
  };
}

const pointAt = (frame: Rect, { x, y }: Point): Point => {
  const offset = turn({ x: (x * frame.width) / 2, y: (y * frame.height) / 2 }, frame.rotation);
  return { x: frame.x + offset.x, y: frame.y + offset.y };
};

/** The world point of a handle on the frame. */
export const handleAt = (frame: Rect, handle: Handle): Point => pointAt(frame, handles[handle]);

/**
 * Scales the items by one factor about the frame's point opposite the handle, as the pointer
 * moves from `from` to `to`. The factor is how far the handle has moved along the line from that
 * point, so a corner and an edge both keep the aspect ratio. The frame's longer edge stays at
 * least `minEdge` long.
 */
export function resized(
  items: ReadonlyMap<string, Pose>,
  frame: Rect,
  handle: Handle,
  from: Point,
  to: Point,
  minEdge: number,
): Map<string, Pose> {
  const grip = handles[handle];
  const about = pointAt(frame, { x: -grip.x, y: -grip.y });
  const start = pointAt(frame, grip);
  const reach = { x: start.x - about.x, y: start.y - about.y };
  // The floor stops a frame from shrinking past `minEdge`. It never enlarges one that is
  // already smaller, so the factor's floor is at most 1.
  const factor = Math.max(
    1 + ((to.x - from.x) * reach.x + (to.y - from.y) * reach.y) / (reach.x ** 2 + reach.y ** 2),
    Math.min(1, minEdge / Math.max(frame.width, frame.height)),
  );
  return new Map(
    [...items].map(([key, pose]) => [
      key,
      {
        x: about.x + (pose.x - about.x) * factor,
        y: about.y + (pose.y - about.y) * factor,
        scale: pose.scale * factor,
        rotation: pose.rotation,
      },
    ]),
  );
}

/**
 * Turns the items about `center` by the angle the pointer sweeps around it from `from` to `to`.
 * With `snap`, one item ends at a whole number of `snapStep`s, and several items turn by one.
 */
export function rotated(
  items: ReadonlyMap<string, Pose>,
  center: Point,
  from: Point,
  to: Point,
  snap: boolean,
): Map<string, Pose> {
  const swept =
    Math.atan2(to.y - center.y, to.x - center.x) - Math.atan2(from.y - center.y, from.x - center.x);
  const angle = Math.atan2(Math.sin(swept), Math.cos(swept));
  const toStep = (value: number) => Math.round(value / snapStep) * snapStep;
  // One item snaps to where it ends up, so Shift can bring it back to upright after a free
  // turn. Several items share one swept angle, so that is what snaps for them.
  const [only] = items.size === 1 ? items.values() : [];
  const by = !snap ? angle : only ? toStep(only.rotation + angle) - only.rotation : toStep(angle);
  return new Map(
    [...items].map(([key, pose]) => {
      const offset = turn({ x: pose.x - center.x, y: pose.y - center.y }, by);
      return [
        key,
        {
          x: center.x + offset.x,
          y: center.y + offset.y,
          scale: pose.scale,
          rotation: pose.rotation + by,
        },
      ];
    }),
  );
}
