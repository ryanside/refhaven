import type { Size } from "./layout";

export type Point = { readonly x: number; readonly y: number };

/** World units are float64 with y down. `x` and `y` are the world point at the screen's top-left corner. */
export type Camera = Point & { readonly zoom: number };

/**
 * An item as the renderer draws it. `x` and `y` are its center, and `width` and `height` its size,
 * in world units. `texture` names the uploaded texture to draw, at any resolution. `z` is a
 * fractional index string.
 */
export type SceneItem = Point &
  Size & {
    readonly key: string;
    readonly texture: string;
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

export * from "./camera";
export * from "./group";
export * from "./history";
export * from "./hit";
export * from "./layout";
export * from "./note";
export * from "./store";
export * from "./transform";
