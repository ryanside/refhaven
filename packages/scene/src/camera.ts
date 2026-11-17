import { type Camera, type Point, screenToWorld } from "./index";
import { type Box, type Size, boundsOf } from "./layout";

export const minZoom = 0.01;
export const maxZoom = 64;

/** The longest edge on screen, in device pixels, that a 512 px thumbnail still draws sharply. */
export const thumbnailEdge = 512;

export type ImageRole = "thumbnail" | "display";

type Placed = Point & Size & { readonly rotation: number };

/** Moves the view by a screen distance, so the content moves the other way. */
export function panBy(camera: Camera, screenDelta: Point): Camera {
  return {
    x: camera.x + screenDelta.x / camera.zoom,
    y: camera.y + screenDelta.y / camera.zoom,
    zoom: camera.zoom,
  };
}

/** Sets the zoom, clamped to its range, and keeps the world point under `screen` where it is. */
export function zoomAt(camera: Camera, screen: Point, zoom: number): Camera {
  const next = Math.min(maxZoom, Math.max(minZoom, zoom));
  const world = screenToWorld(camera, screen);
  return { x: world.x - screen.x / next, y: world.y - screen.y / next, zoom: next };
}

export const boxOf = (item: Placed): Box => boundsOf([{ ...item, scale: 1 }])!;

/** A camera that shows every item, centered, with a margin, at no more than 100%. */
export function fitCamera(viewport: Size, items: Iterable<Placed>, margin = 40): Camera {
  const bounds = boundsOf([...items].map((item) => ({ ...item, scale: 1 })));
  if (!bounds) return { x: 0, y: 0, zoom: 1 };
  const zoom = Math.min(
    maxZoom,
    Math.max(
      minZoom,
      Math.min(
        1,
        (viewport.width - 2 * margin) / (bounds.right - bounds.left),
        (viewport.height - 2 * margin) / (bounds.bottom - bounds.top),
      ),
    ),
  );
  return {
    x: (bounds.left + bounds.right) / 2 - viewport.width / 2 / zoom,
    y: (bounds.top + bounds.bottom) / 2 - viewport.height / 2 / zoom,
    zoom,
  };
}

/** The items that overlap the viewport grown by `margin` screen pixels on each side. */
export function itemsInView<Item extends Placed>(
  items: Iterable<Item>,
  camera: Camera,
  viewport: Size,
  margin: number,
): Array<Item> {
  const left = camera.x - margin / camera.zoom;
  const top = camera.y - margin / camera.zoom;
  const right = camera.x + (viewport.width + margin) / camera.zoom;
  const bottom = camera.y + (viewport.height + margin) / camera.zoom;
  return [...items].filter((item) => {
    const box = boxOf(item);
    return box.left < right && box.right > left && box.top < bottom && box.bottom > top;
  });
}

/** The image an item needs: the thumbnail until its longer edge passes `thumbnailEdge` device pixels. */
export function imageRole(item: Size, devicePixelsPerUnit: number): ImageRole {
  return Math.max(item.width, item.height) * devicePixelsPerUnit > thumbnailEdge
    ? "display"
    : "thumbnail";
}
