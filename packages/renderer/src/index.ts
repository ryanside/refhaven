import type { Camera, SceneItem } from "@refhaven/scene";

export interface Renderer {
  setCamera(camera: Camera): void;
  upsertItems(items: ReadonlyArray<SceneItem>): void;
  removeItems(keys: ReadonlyArray<string>): void;
  uploadTexture(key: string, source: ImageBitmap): void;
  evictTexture(key: string): void;
  draw(): void;
  destroy(): void;
}
