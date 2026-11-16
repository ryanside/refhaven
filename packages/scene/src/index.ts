export type Point = { readonly x: number; readonly y: number };

/** World units are float64 with y down. `x` and `y` are the world point at the screen's top-left corner. */
export type Camera = Point & { readonly zoom: number };

/** `x` and `y` are the item's center in world units. `z` is a fractional index string. */
export type SceneItem = Point & {
  readonly key: string;
  readonly texture: string;
  readonly scale: number;
  readonly rotation: number;
  readonly z: string;
};

export function worldToScreen(camera: Camera, world: Point): Point {
  return {
    x: (world.x - camera.x) * camera.zoom,
    y: (world.y - camera.y) * camera.zoom,
  };
}

export function screenToWorld(camera: Camera, screen: Point): Point {
  return {
    x: screen.x / camera.zoom + camera.x,
    y: screen.y / camera.zoom + camera.y,
  };
}

export * from "./layout";
